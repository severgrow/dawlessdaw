import type { CircuitMirrorSnapshot, MirrorCell } from '@dawlessdaw/sequencer';
import { destBadge } from '@dawlessdaw/devices';
import { useStudioStore } from '../store/useStudioStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

function padClass(cell: MirrorCell, playhead: boolean): string {
  return [
    'cm-pad',
    cell.kind === 'bright' ? 'cm-bright' : '',
    cell.kind === 'dim' ? 'cm-dim' : '',
    cell.kind === 'empty' ? 'cm-empty' : '',
    playhead ? 'cm-playhead' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Premium read-only 8×16 Circuit Mirror grid (Live or Saved cells).
 */
export function CircuitMirrorGrid({
  snap,
  label,
  readOnlyHint,
}: {
  snap: Pick<CircuitMirrorSnapshot, 'tracks' | 'playhead' | 'playing' | 'length' | 'cycle'>;
  label: string;
  readOnlyHint: string;
}) {
  const controller = useStudioStore((s) => s.controller);

  return (
    <div className="cm-grid-wrap">
      <div className="cm-grid-label">
        <span>{label}</span>
        <span className="cm-meta muted small">
          {snap.playing ? `cycle ${snap.cycle + 1}` : 'stopped'}
          {snap.playhead >= 0 ? ` · step ${snap.playhead + 1}` : ''}
        </span>
      </div>
      <p className="muted small cm-hint">{readOnlyHint}</p>
      <div className="cm-step-nums" aria-hidden="true">
        <span className="cm-track-gutter" />
        {Array.from({ length: snap.length }, (_, i) => (
          <span key={i} className={`cm-step-num${snap.playhead === i ? ' play' : ''}`}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="cm-grid" role="grid" aria-label="Circuit Mirror 8 by 16">
        {snap.tracks.map((row, ti) => {
          const trackNo = ti + 1;
          const dest = controller.tracks[ti]?.dest ?? null;
          return (
            <div key={trackNo} className="cm-row" role="row">
              <div className="cm-track-meta">
                <b>T{trackNo}</b>
                <span className={`cm-dest ${dest ? `dev-${dest.device}` : 'dev-off'}`}>
                  {destBadge(dest)}
                </span>
              </div>
              <div className="cm-pads">
                {row.slice(0, snap.length).map((cell, si) => (
                  <div
                    key={si}
                    role="gridcell"
                    className={padClass(cell, snap.playhead === si && snap.playing)}
                    title={
                      cell.kind === 'empty'
                        ? `T${trackNo} step ${si + 1} empty`
                        : `T${trackNo} step ${si + 1} ${cell.kind} · ${noteName(cell.note)} · v${cell.velocity}`
                    }
                    style={
                      cell.kind !== 'empty'
                        ? { opacity: 0.4 + (cell.velocity / 127) * 0.6 }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cm-legend muted small" aria-hidden="true">
        <span className="cm-leg cm-bright" /> bright (confirmed)
        <span className="cm-leg cm-dim" /> dim (this cycle / fading)
        <span className="cm-leg cm-empty" /> empty
      </div>
    </div>
  );
}
