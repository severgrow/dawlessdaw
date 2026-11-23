import { destBadge, slotLabelText } from '@dawlessdaw/devices';
import { saveJamSeen } from '../nav/tabs';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CircuitTempo } from './CircuitTempo';

/**
 * Jam mode (J): big track tiles + named knobs + Panic.
 * Does not change routing — display / panic only.
 */
export function JamMode({ onClose }: { onClose: () => void }) {
  const snap = useStudioStore();
  const { panic } = useStudioActions();
  const circuitTrack = snap.activeCircuitTrack;
  const knobTrack = circuitTrack ?? 1;
  const track = snap.controller.tracks[knobTrack - 1]!;

  return (
    <div className="jam-scrim" role="dialog" aria-modal="true" aria-label="Jam mode">
      <div className="jam-stage">
        <div className="jam-head">
          <h1>Jam</h1>
          <CircuitTempo size="jam" />
          <div className="row">
            <button type="button" className="danger" onClick={() => panic()}>
              Panic
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                saveJamSeen();
                onClose();
              }}
            >
              Exit · Esc
            </button>
          </div>
        </div>

        <div className="jam-tiles" role="list">
          {snap.controller.tracks.map((tr, i) => {
            const t = i + 1;
            const hit = snap.trackActivity[t] ?? 0;
            const active = circuitTrack === t;
            return (
              <div
                key={t}
                role="listitem"
                className={`jam-tile ${tr.dest ? `dev-${tr.dest.device}` : 'dev-off'}${active ? ' active' : ''}${hit ? ' flash' : ''}`}
              >
                <span key={hit} className="jam-pad">
                  T{t}
                </span>
                <b>{destBadge(tr.dest)}</b>
              </div>
            );
          })}
        </div>

        <div className="jam-knobs">
          <h2>
            Knobs · T{knobTrack}
            {track.dest ? ` → ${destBadge(track.dest)}` : ''}
          </h2>
          <div className="jam-knob-row">
            {track.knobs.map((slot, k) => {
              const live =
                snap.lastKnob && snap.lastKnob.track === knobTrack && snap.lastKnob.knob === k
                  ? snap.lastKnob.at
                  : 0;
              const val = snap.knobValues[knobTrack - 1]?.[k] ?? 0;
              return (
                <div key={k} className={`jam-knob${live ? ' moved' : ''}`}>
                  <div className="jam-knob-dial" style={{ ['--v' as string]: val / 127 }}>
                    <span>{k + 1}</span>
                  </div>
                  <span className="jam-knob-name">
                    {slot.target && track.dest ? slotLabelText(slot) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
