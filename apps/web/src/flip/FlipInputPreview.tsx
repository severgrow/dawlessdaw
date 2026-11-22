/**
 * Compact live input meter + mini-wave for the FLIP lane.
 * Idle/armed/ready: silent analyser preview (no speaker path).
 * Recording: reuses CaptureEngine worklet meters from the parent.
 */
import { useEffect, useRef, useState } from 'react';
import type { MeterLevels } from '../recorder/captureEngine';
import {
  getInputPreviewEngine,
  type InputPreviewStatus,
} from '../recorder/inputPreview';
import {
  classifyInputLevel,
  meterPct,
  type InputLevelKind,
} from '../recorder/inputPreviewLevels';

export interface FlipInputPreviewProps {
  deviceId: string | null;
  /** When false, preview graph is stopped (e.g. processing). */
  enabled: boolean;
  /**
   * While CaptureEngine is recording, pass its worklet meters and skip the
   * separate preview graph (avoids fighting getUserMedia).
   */
  captureMeters?: MeterLevels | null;
}

function kindLabel(kind: InputLevelKind): string {
  if (kind === 'silence') return 'silence';
  if (kind === 'hot') return 'hot';
  return 'signal';
}

export function FlipInputPreview({
  deviceId,
  enabled,
  captureMeters = null,
}: FlipInputPreviewProps) {
  const [preview, setPreview] = useState<InputPreviewStatus>(() =>
    getInputPreviewEngine().status(),
  );
  const waveRef = useRef<HTMLCanvasElement>(null);
  const usingCapture = captureMeters != null;
  const active = enabled && Boolean(deviceId);

  useEffect(() => getInputPreviewEngine().subscribe(setPreview), []);

  useEffect(() => {
    if (!active || usingCapture) {
      void getInputPreviewEngine().stop();
      return;
    }
    void getInputPreviewEngine().start(deviceId);
    return () => {
      void getInputPreviewEngine().stop();
    };
  }, [active, deviceId, usingCapture]);

  const meters = usingCapture ? captureMeters! : preview.meters;
  const kind = usingCapture
    ? classifyInputLevel(meters.left, meters.right)
    : preview.kind;
  const running = usingCapture || preview.running;
  const error = usingCapture ? null : preview.error;
  const metersRef = useRef(meters);
  const kindRef = useRef(kind);
  metersRef.current = meters;
  kindRef.current = kind;

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas || !running) return;
    let raf = 0;
    const eng = getInputPreviewEngine();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const css = getComputedStyle(document.documentElement);
      const accent = css.getPropertyValue('--accent').trim() || '#9a2a45';
      const dim = css.getPropertyValue('--line-hard').trim() || '#3a3a3a';
      const mint = css.getPropertyValue('--alert-hi').trim() || '#b5ead3';
      const k = kindRef.current;
      const m = metersRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = dim;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (usingCapture) {
        // Worklet meters only while recording — draw peak envelope bars.
        const peak = Math.max(m.left, m.right);
        const amp = Math.min(1, peak * 2.5) * (h / 2) * 0.9;
        ctx.fillStyle = k === 'silence' ? dim : k === 'hot' ? mint : accent;
        ctx.globalAlpha = k === 'silence' ? 0.35 : 0.85;
        ctx.fillRect(0, h / 2 - amp, w, amp * 2);
        ctx.globalAlpha = 1;
        return;
      }

      const n = eng.mixFftSize() || 1024;
      const buf = new Uint8Array(new ArrayBuffer(n));
      if (!eng.readMixTimeDomain(buf)) return;
      let start = 0;
      for (let i = 1; i < n / 2; i++) {
        if (buf[i - 1]! < 128 && buf[i]! >= 128) {
          start = i;
          break;
        }
      }
      const span = Math.floor(n / 2);
      ctx.strokeStyle = k === 'silence' ? dim : k === 'hot' ? mint : accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < span; i++) {
        const v = (buf[start + i]! - 128) / 128;
        const x = (i / (span - 1)) * w;
        const y = h / 2 - v * (h / 2) * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [running, usingCapture]);

  if (!deviceId) {
    return (
      <div className="flip-input-preview idle" role="status" aria-label="FLIP input preview">
        <span className="muted small">Select an input to see live level</span>
      </div>
    );
  }

  if (!enabled) return null;

  const lPct = meterPct(meters.left);
  const rPct = meterPct(meters.right);

  return (
    <div
      className={`flip-input-preview kind-${kind}${running ? ' live' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`FLIP input ${kindLabel(kind)}`}
    >
      <canvas
        ref={waveRef}
        className="flip-live-wave"
        width={280}
        height={36}
        aria-hidden="true"
      />
      <div className="flip-live-meters" aria-hidden="true">
        <div className={`flip-live-meter${meters.clipLeft ? ' clip' : ''}`}>
          <span className="mono">L</span>
          <div className="flip-live-track">
            <i style={{ width: `${lPct}%` }} />
          </div>
        </div>
        <div className={`flip-live-meter${meters.clipRight ? ' clip' : ''}`}>
          <span className="mono">R</span>
          <div className="flip-live-track">
            <i style={{ width: `${rPct}%` }} />
          </div>
        </div>
      </div>
      <span className={`flip-live-kind kind-${kind} mono small`}>{kindLabel(kind)}</span>
      {error ? <span className="flip-live-err muted small">{error}</span> : null}
    </div>
  );
}
