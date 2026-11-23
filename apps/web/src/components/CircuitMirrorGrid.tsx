import type {
  CircuitIntelligenceSnapshot,
  CircuitMirrorSnapshot,
  MirrorCell,
} from '@dawlessdaw/sequencer';
import { activityToCss, confidenceToCss, mirrorKindToObservation } from '@dawlessdaw/sequencer';
import { destBadge } from '@dawlessdaw/devices';
import { useStudioStore } from '../store/useStudioStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

function padClass(cell: MirrorCell, playhead: boolean): string {
  const obs = mirrorKindToObservation(cell.kind);
  return [
    'cm-pad',
    cell.kind === 'bright' ? 'cm-bright' : '',
    cell.kind === 'dim' ? 'cm-dim' : '',
    cell.kind === 'empty' ? 'cm-empty' : '',
    `cm-obs-${obs}`,
    playhead ? 'cm-playhead' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Premium read-only 8×16 Circuit Mirror grid (Live or Saved cells).
 * Live mode may pass intelligence for last-touched + activity labels.
 */
export function CircuitMirrorGrid({
  snap,
  label,
  readOnlyHint,
  intelligence,
}: {
  snap: Pick<CircuitMirrorSnapshot, 'tracks' | 'playhead' | 'playing' | 'length' | 'cycle'>;
  label: string;
  readOnlyHint: string;
  intelligence?: Pick<CircuitIntelligenceSnapshot, 'lastTouched' | 'tracks'> | null;
}) {
  const controller = useStudioStore((s) => s.controller);
  const touched = intelligence?.lastTouched.track ?? null;

  return (
    <div className="cm-grid-wrap">
      <div className="cm-grid-label">
        <span>{label}</span>
        <span className="cm-meta muted small">
          {snap.playing ? `cycle ${snap.cycle + 1}` : 'stopped'}
          {snap.playhead >= 0 ? ` · step ${snap.playhead + 1}` : ''}
          {touched != null ? ` · last-touched T${touched}` : ''}
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
          const act = intelligence?.tracks[ti];
          return (
            <div
              key={trackNo}
              className={`cm-row${touched === trackNo ? ' cm-row-touched' : ''}`}
              role="row"
            >
              <div className="cm-track-meta">
                <b>T{trackNo}</b>
                <span className={`cm-dest ${dest ? `dev-${dest.device}` : 'dev-off'}`}>
                  {destBadge(dest)}
                </span>
                {act ? (
                  <span
                    className={`cm-act ${activityToCss(act.label)} ${confidenceToCss(act.confidence)}`}
                    title={act.reason}
                  >
                    {act.label}
                  </span>
                ) : null}
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
                        : `T${trackNo} step ${si + 1} ${mirrorKindToObservation(cell.kind)} · ${noteName(cell.note)} · v${cell.velocity}`
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
        <span className="cm-leg cm-bright" /> observed
        <span className="cm-leg cm-dim" /> inferred
        <span className="cm-leg cm-empty" /> empty
        <span className="cm-leg-note">not pattern RAM</span>
        {intelligence ? (
          <>
            <span className="cm-leg cm-touched-leg" /> last-touched
          </>
        ) : null}
      </div>
    </div>
  );
}
