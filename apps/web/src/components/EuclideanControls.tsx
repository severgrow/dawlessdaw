import { useState } from 'react';
import type { EuclideanSettings } from '@dawlessdaw/sequencer';

export function EuclideanControls({
  length,
  apply,
}: {
  length: number;
  apply: (settings: EuclideanSettings) => { hits: number; blocked: number };
}) {
  const [track, setTrack] = useState(1);
  const [stepCount, setStepCount] = useState(length);
  const [hitCount, setHitCount] = useState(5);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const steps = Math.min(stepCount, length);
  const hits = Math.min(hitCount, steps);
  const rotation = Math.min(offset, steps - 1);

  return (
    <details className="pattern-settings">
      <summary>Euclidean rhythm</summary>
      <div className="gen-strip">
        <label className="seq-field">
          Target track
          <select value={track} onChange={(e) => setTrack(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i + 1}>T{i + 1}</option>
            ))}
          </select>
        </label>
        <label className="seq-field">
          Hits
          <input type="number" min={0} max={steps} value={hits}
            onChange={(e) => setHitCount(Math.max(0, Math.min(steps, Number(e.target.value))))} />
        </label>
        <label className="seq-field">
          Steps
          <input type="number" min={1} max={length} value={steps}
            onChange={(e) => setStepCount(Math.max(1, Math.min(length, Number(e.target.value))))} />
        </label>
        <label className="seq-field">
          Rotation
          <input type="number" min={0} max={steps - 1} value={rotation}
            onChange={(e) => setOffset(Math.max(0, Math.min(steps - 1, Number(e.target.value))))} />
        </label>
        <button type="button" className="seq-btn" onClick={() => {
          const result = apply({ track, hits, steps, rotation });
          const locked = result.blocked > 0 ? ` · ${result.blocked} locked steps kept` : '';
          setStatus(`T${track} · ${result.hits}/${steps} hits${locked}`);
        }}>
          Apply to B
        </button>
        <span className="pattern-feedback muted small" role="status">{status}</span>
      </div>
    </details>
  );
}
