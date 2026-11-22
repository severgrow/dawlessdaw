import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live picture (and optional monitor) of the rig's audio — normally the ZED-10FX's
 * USB stereo out, which macOS calls "USB Audio CODEC". Runs only in this browser:
 * nothing is recorded, saved or sent anywhere.
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
    const ins = all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications');
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
        let stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio,
        });
        // First run: labels only appear after permission. Prefer the ZED / last-used source.
        const ins = await refreshDevices();
        if (!deviceId) {
          const want =
            ins.find((d) => prefs.current.sourceLabel && d.label === prefs.current.sourceLabel) ??
            ins.find((d) => /usb audio codec|zed/i.test(d.label));
          const current = stream.getAudioTracks()[0]?.getSettings().deviceId;
          if (want && want.deviceId !== current) {
            stream.getTracks().forEach((t) => t.stop());
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { ...audio, deviceId: { exact: want.deviceId } },
            });
          }
        }
        const usedId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? '';
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

  // Drawing loop.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastMeter = 0;
    const time = new Uint8Array(2048);
    const freq = new Uint8Array(1024);
    const lt = new Float32Array(1024);
    const rt = new Float32Array(1024);
    const caps = new Float32Array(48);
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
      const accent = css.getPropertyValue('--accent').trim() || '#d996a9';
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
        // Start at a rising zero crossing so the picture stands still.
        let start = 0;
        for (let i = 1; i < time.length / 2; i++) {
          if (time[i - 1]! < 128 && time[i]! >= 128) {
            start = i;
            break;
          }
        }
        const n = time.length / 2;
        g.strokeStyle = accent;
        g.lineWidth = 2 * dpr;
        g.shadowColor = accent;
        g.shadowBlur = 8 * dpr;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const v = (time[start + i]! - 128) / 128;
          const x = (i / (n - 1)) * w;
          const y = h / 2 - v * (h / 2) * 0.92;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.shadowBlur = 0;
      } else if (s === 'bars') {
        e.mix.getByteFrequencyData(freq);
        const bars = caps.length;
        const gap = 3 * dpr;
        const bw = (w - gap * (bars - 1)) / bars;
        const nyq = e.ctx.sampleRate / 2;
        for (let b = 0; b < bars; b++) {
          // Log-spaced 30 Hz – 16 kHz
          const f0 = 30 * Math.pow(16000 / 30, b / bars);
          const f1 = 30 * Math.pow(16000 / 30, (b + 1) / bars);
          const i0 = Math.floor((f0 / nyq) * freq.length);
          const i1 = Math.max(i0 + 1, Math.floor((f1 / nyq) * freq.length));
          let peak = 0;
          for (let i = i0; i < i1 && i < freq.length; i++) peak = Math.max(peak, freq[i]!);
          const v = peak / 255;
          const bh = Math.max(2 * dpr, v * h * 0.95);
          caps[b] = Math.max(v, (caps[b] ?? 0) - 0.012);
          const x = b * (bw + gap);
          g.fillStyle = accent;
          g.globalAlpha = 0.35 + v * 0.65;
          g.fillRect(x, h - bh, bw, bh);
          g.globalAlpha = 1;
          g.fillRect(x, h - caps[b]! * h * 0.95 - 2 * dpr, bw, 2 * dpr);
        }
      } else {
        e.mix.getByteTimeDomainData(time);
        let sum = 0;
        for (let i = 0; i < time.length; i++) sum += ((time[i]! - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / time.length);
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.28 * (1 + rms * 0.9);
        g.strokeStyle = accent;
        g.lineWidth = 2 * dpr;
        g.shadowColor = accent;
        g.shadowBlur = 10 * dpr;
        g.beginPath();
        const pts = 256;
        for (let i = 0; i <= pts; i++) {
          const v = (time[Math.floor((i % pts) * (time.length / pts))]! - 128) / 128;
          const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
          const r = base + v * Math.min(w, h) * 0.22;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.shadowBlur = 0;
        g.globalAlpha = 0.25;
        g.beginPath();
        g.arc(cx, cy, base * 0.55, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Peak meters ~12×/s (React state).
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
            {!sourceId ? <option value="">Press Start to pick</option> : null}
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
            <p>Press <b>Start</b> to see your mixer&apos;s sound.</p>
            <p className="muted small">
              Uses the ZED&apos;s USB audio (&quot;USB Audio CODEC&quot;). Chrome will ask to use
              the microphone — that&apos;s this input. Nothing is recorded.
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
