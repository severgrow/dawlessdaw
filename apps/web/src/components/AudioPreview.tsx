import { useCallback, useEffect, useRef, useState } from 'react';
import {
  filterSelectableAudioInputs,
  pickPreferredInputId,
  PLUG_IN_INTERFACE,
} from '../recorder/devices';
import { clearMixerOutLevels, publishMixerOutLevels } from './mixerOutBus';

/**
 * Live picture (and optional monitor) of the rig's audio — normally the ZED-10FX's
 * USB stereo out, which macOS calls "USB Audio CODEC". Runs only in this browser:
 * nothing is recorded, saved or sent anywhere. Levels also drive the Rig map backdrop.
 */

type Style = 'wave' | 'bars' | 'ring';
const STYLES: { id: Style; label: string }[] = [
  { id: 'wave', label: 'Wave' },
  { id: 'bars', label: 'Bars' },
  { id: 'ring', label: 'Ring' },
];
const PREFS_KEY = 'dawlessdaw.audioPreview';
const NO_OUTPUT = '__none__';

interface Prefs {
  sourceLabel?: string;
  outputId?: string;
  style?: Style;
}

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}
function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable
  }
}

function dbfs(v: number): number {
  return v > 0 ? 20 * Math.log10(v) : -Infinity;
}

interface Engine {
  ctx: AudioContext;
  stream: MediaStream;
  mix: AnalyserNode;
  left: AnalyserNode;
  right: AnalyserNode;
}

export function AudioPreview() {
  const prefs = useRef<Prefs>(loadPrefs());
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [outputId, setOutputId] = useState(prefs.current.outputId ?? NO_OUTPUT);
  const [style, setStyle] = useState<Style>(prefs.current.style ?? 'wave');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState({ l: -Infinity, r: -Infinity, clip: false });
  const engine = useRef<Engine | null>(null);
  const monitor = useRef<HTMLAudioElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const styleRef = useRef(style);
  styleRef.current = style;

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    const rawIns = all.filter((d) => d.kind === 'audioinput');
    // Never offer MacBook / iPhone / Continuity mics — interfaces only.
    const allowed = new Set(
      filterSelectableAudioInputs(
        rawIns.map((d) => ({ deviceId: d.deviceId, label: d.label || '' })),
      ).map((d) => d.deviceId),
    );
    const ins = rawIns.filter((d) => allowed.has(d.deviceId));
    setInputs(ins);
    setOutputs(all.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications'));
    return ins;
  }, []);

  useEffect(() => {
    void refreshDevices();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refreshDevices);
    return () => md?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  const stop = useCallback(() => {
    const e = engine.current;
    engine.current = null;
    e?.stream.getTracks().forEach((t) => t.stop());
    void e?.ctx.close();
    if (monitor.current) {
      monitor.current.pause();
      monitor.current.srcObject = null;
    }
    clearMixerOutLevels();
    setRunning(false);
    setLevels({ l: -Infinity, r: -Infinity, clip: false });
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (deviceId?: string) => {
      setError(null);
      stop();
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot listen to audio inputs. Use Chrome.');
        return;
      }
      try {
        // Raw signal: no echo cancelling, noise removal or auto volume.
        const audio: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        };

        // Resolve a selectable interface first — never auto-open a built-in mic.
        let ins = await refreshDevices();
        if (!ins.length && !deviceId) {
          // One short permission grant so labels appear, then re-filter.
          try {
            const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            probe.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
          ins = await refreshDevices();
        }
        const wantId =
          deviceId ||
          pickPreferredInputId(
            ins.map((d) => ({ deviceId: d.deviceId, label: d.label || '' })),
            ins.find((d) => d.label === prefs.current.sourceLabel)?.deviceId ?? null,
          );
        if (!wantId) {
          setSourceId('');
          setError(PLUG_IN_INTERFACE);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { ...audio, deviceId: { exact: wantId } },
        });
        ins = await refreshDevices();
        // If the opened device was filtered out (built-in), abort.
        if (!ins.some((d) => d.deviceId === wantId)) {
          stream.getTracks().forEach((t) => t.stop());
          setSourceId('');
          setError(PLUG_IN_INTERFACE);
          return;
        }
        const usedId = wantId;
        setSourceId(usedId);
        const label = ins.find((d) => d.deviceId === usedId)?.label;
        prefs.current = { ...prefs.current, sourceLabel: label };
        savePrefs(prefs.current);

        const ctx = new AudioContext({ latencyHint: 'interactive' });
        const src = ctx.createMediaStreamSource(stream);
        const mix = ctx.createAnalyser();
        mix.fftSize = 2048;
        mix.smoothingTimeConstant = 0.75;
        const split = ctx.createChannelSplitter(2);
        const left = ctx.createAnalyser();
        const right = ctx.createAnalyser();
        left.fftSize = right.fftSize = 1024;
        src.connect(mix);
        src.connect(split);
        split.connect(left, 0);
        split.connect(right, 1);
        engine.current = { ctx, stream, mix, left, right };
        setRunning(true);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Chrome was not allowed to use audio inputs. Click the icon left of the address bar, allow the microphone, then press Start.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'That audio input is not connected. Check the USB cable and pick another source.'
              : 'Could not open the audio input.',
        );
      }
    },
    [refreshDevices, stop],
  );

  // Monitor: play the input through the chosen output (or not at all).
  useEffect(() => {
    const el = monitor.current;
    const e = engine.current;
    if (!el) return;
    prefs.current = { ...prefs.current, outputId };
    savePrefs(prefs.current);
    if (!running || !e || outputId === NO_OUTPUT) {
      el.pause();
      el.srcObject = null;
      return;
    }
    el.srcObject = e.stream;
    const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    void (withSink.setSinkId ? withSink.setSinkId(outputId) : Promise.resolve())
      .then(() => el.play())
      .catch(() => setError('Could not play through that output.'));
  }, [outputId, running]);

  useEffect(() => {
    prefs.current = { ...prefs.current, style };
    savePrefs(prefs.current);
  }, [style]);

  // Drawing loop — bouncy wave / spring bars / dual ring; publishes levels for Rig backdrop.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastMeter = 0;
    const time = new Uint8Array(2048);
    const freq = new Uint8Array(1024);
    const lt = new Float32Array(1024);
    const rt = new Float32Array(1024);
    const caps = new Float32Array(48);
    const barH = new Float32Array(48);
    const barV = new Float32Array(48);
    let ringScale = 1;
    let ringVel = 0;
    const mint = '#9fdcc2';
    const bone = '#e8e1d2';
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const e = engine.current;
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (!e || !c || !g) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const css = getComputedStyle(c);
      const accent = css.getPropertyValue('--accent').trim() || '#9fdcc2';
      const grid = css.getPropertyValue('--line').trim() || '#2b2b2b';
      g.clearRect(0, 0, w, h);
      g.strokeStyle = grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();

      const s = styleRef.current;
      if (s === 'wave') {
        e.mix.getByteTimeDomainData(time);
        let start = 0;
        for (let i = 1; i < time.length / 2; i++) {
          if (time[i - 1]! < 128 && time[i]! >= 128) {
            start = i;
            break;
          }
        }
        const n = time.length / 2;
        const mid = h / 2;
        // Soft fill under the wave (mint wash; burgundy reserved for accents elsewhere).
        const fill = g.createLinearGradient(0, 0, 0, h);
        fill.addColorStop(0, 'rgba(159, 220, 194, 0.35)');
        fill.addColorStop(0.55, 'rgba(90, 168, 144, 0.12)');
        fill.addColorStop(1, 'rgba(10, 10, 10, 0)');
        g.beginPath();
        g.moveTo(0, mid);
        for (let i = 0; i < n; i++) {
          const v = (time[start + i]! - 128) / 128;
          const x = (i / (n - 1)) * w;
          const y = mid - v * mid * 0.95;
          g.lineTo(x, y);
        }
        g.lineTo(w, mid);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = accent;
        g.lineWidth = 2.6 * dpr;
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const v = (time[start + i]! - 128) / 128;
          const x = (i / (n - 1)) * w;
          const y = mid - v * mid * 0.95;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.shadowBlur = 0;
        // Bone highlight stroke, thinner.
        g.strokeStyle = bone;
        g.globalAlpha = 0.35;
        g.lineWidth = 1 * dpr;
        g.stroke();
        g.globalAlpha = 1;
      } else if (s === 'bars') {
        e.mix.getByteFrequencyData(freq);
        const bars = caps.length;
        const gap = 2.5 * dpr;
        const bw = (w - gap * (bars - 1)) / bars;
        const nyq = e.ctx.sampleRate / 2;
        for (let b = 0; b < bars; b++) {
          const f0 = 30 * Math.pow(16000 / 30, b / bars);
          const f1 = 30 * Math.pow(16000 / 30, (b + 1) / bars);
          const i0 = Math.floor((f0 / nyq) * freq.length);
          const i1 = Math.max(i0 + 1, Math.floor((f1 / nyq) * freq.length));
          let peak = 0;
          for (let i = i0; i < i1 && i < freq.length; i++) peak = Math.max(peak, freq[i]!);
          const target = peak / 255;
          // Spring toward target — slight overshoot for bounce.
          const force = (target - barH[b]!) * 0.32;
          barV[b] = (barV[b]! + force) * 0.72;
          barH[b] = Math.max(0, barH[b]! + barV[b]!);
          caps[b] = Math.max(barH[b]!, (caps[b] ?? 0) - 0.01);
          const bh = Math.max(2 * dpr, barH[b]! * h * 0.96);
          const x = b * (bw + gap);
          const t = b / (bars - 1);
          g.fillStyle = t < 0.55 ? accent : t < 0.82 ? mint : bone;
          g.globalAlpha = 0.4 + Math.min(1, barH[b]!) * 0.6;
          const radius = Math.min(bw / 2, 4 * dpr);
          g.beginPath();
          g.moveTo(x, h);
          g.lineTo(x, h - bh + radius);
          g.quadraticCurveTo(x, h - bh, x + radius, h - bh);
          g.lineTo(x + bw - radius, h - bh);
          g.quadraticCurveTo(x + bw, h - bh, x + bw, h - bh + radius);
          g.lineTo(x + bw, h);
          g.closePath();
          g.fill();
          g.globalAlpha = 1;
          g.fillStyle = bone;
          g.fillRect(x, h - caps[b]! * h * 0.96 - 2.5 * dpr, bw, 2.5 * dpr);
        }
      } else {
        e.mix.getByteTimeDomainData(time);
        let sum = 0;
        for (let i = 0; i < time.length; i++) sum += ((time[i]! - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / time.length);
        const target = 1 + rms * 1.15;
        ringVel += (target - ringScale) * 0.28;
        ringVel *= 0.78;
        ringScale += ringVel;
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.26 * ringScale;
        // Outer mint wash ring.
        g.strokeStyle = mint;
        g.globalAlpha = 0.28 + rms * 0.4;
        g.lineWidth = 3 * dpr;
        g.beginPath();
        g.arc(cx, cy, base * 1.18, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        g.strokeStyle = accent;
        g.lineWidth = 2.4 * dpr;
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.beginPath();
        const pts = 256;
        for (let i = 0; i <= pts; i++) {
          const v = (time[Math.floor((i % pts) * (time.length / pts))]! - 128) / 128;
          const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
          const r = base + v * Math.min(w, h) * 0.24;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = bone;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.arc(cx, cy, base * 0.48, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Peak meters ~12×/s + publish for Rig backdrop.
      if (now - lastMeter > 80) {
        lastMeter = now;
        e.left.getFloatTimeDomainData(lt);
        e.right.getFloatTimeDomainData(rt);
        let pl = 0;
        let pr = 0;
        for (let i = 0; i < lt.length; i++) {
          pl = Math.max(pl, Math.abs(lt[i]!));
          pr = Math.max(pr, Math.abs(rt[i]!));
        }
        const energy = Math.min(1, Math.sqrt(((pl * pl + pr * pr) / 2) * 2.2));
        publishMixerOutLevels({
          l: Math.min(1, pl),
          r: Math.min(1, pr),
          energy,
          running: true,
        });
        setLevels((prev) => ({
          l: dbfs(pl),
          r: dbfs(pr),
          clip: pl >= 0.999 || pr >= 0.999 ? true : prev.clip,
        }));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const meter = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const fmt = (db: number) => (Number.isFinite(db) ? `${db.toFixed(1)} dB` : '−∞');
  const sourceLabel = inputs.find((d) => d.deviceId === sourceId)?.label;
  const outputLabel = outputs.find((d) => d.deviceId === outputId)?.label;
  const sameDevice =
    outputId !== NO_OUTPUT &&
    Boolean(sourceLabel && outputLabel) &&
    sourceLabel!.replace(/\s*\(.*\)$/, '') === outputLabel!.replace(/\s*\(.*\)$/, '');

  return (
    <div className="panel audio-preview">
      <h2>Listen · mixer out</h2>

      <div className="ap-controls">
        <label className="ap-field">
          <span className="ap-label">Source</span>
          <select
            className="ap-select"
            value={sourceId}
            disabled={!inputs.length}
            onChange={(e) => void start(e.target.value)}
          >
            {!inputs.length ? (
              <option value="">{PLUG_IN_INTERFACE}</option>
            ) : !sourceId ? (
              <option value="">Pick Scarlett / ZED / USB</option>
            ) : null}
            {inputs.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Audio input ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label className="ap-field">
          <span className="ap-label">Output · hear it on</span>
          <select
            className="ap-select ap-output"
            value={outputId}
            onChange={(e) => setOutputId(e.target.value)}
          >
            <option value={NO_OUTPUT}>Don&apos;t play — picture only</option>
            {outputs.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || (d.deviceId === 'default' ? 'Mac default output' : `Audio output ${i + 1}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`ap-start${running ? ' active' : ''}`}
          onClick={() => (running ? stop() : void start(sourceId || undefined))}
        >
          {running ? '■ Stop' : '▶ Start'}
        </button>
      </div>

      <div className="ap-stage">
        <canvas ref={canvas} className="ap-canvas" aria-label={`Audio ${style} display`} />
        {!running ? (
          <div className="ap-idle">
            <p>
              {inputs.length ? (
                <>
                  Press <b>Start</b> — interface in only.
                </>
              ) : (
                PLUG_IN_INTERFACE
              )}
            </p>
          </div>
        ) : null}
        <div className="ap-styles" role="radiogroup" aria-label="Display style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={style === s.id}
              className={style === s.id ? 'active' : ''}
              onClick={() => setStyle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ap-meters">
        {(['l', 'r'] as const).map((ch) => (
          <div key={ch} className="ap-meter">
            <span className="mono">{ch.toUpperCase()}</span>
            <span className="ap-bar">
              <span className="ap-fill" style={{ width: `${meter(levels[ch])}%` }} />
            </span>
            <span className="mono ap-db">{fmt(levels[ch])}</span>
          </div>
        ))}
        <button
          type="button"
          className={`ap-clip${levels.clip ? ' on' : ''}`}
          title="Lights if the signal hit full scale. Click to reset."
          onClick={() => setLevels((p) => ({ ...p, clip: false }))}
        >
          clip
        </button>
      </div>

      {sameDevice ? (
        <p className="warn">
          Output is the same device as the source — if the ZED sends its USB return back into the
          mix, this will feed back. Pick headphones or the Mac speakers.
        </p>
      ) : null}
      {error ? <p className="warn">{error}</p> : null}
      <audio ref={monitor} hidden />
    </div>
  );
}
