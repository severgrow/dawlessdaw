import {
  activityToCss,
  confidenceToCss,
  type CircuitIntelligenceSnapshot,
} from '@dawlessdaw/sequencer';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * Passive Circuit Intelligence readout — last-touched, position, activity guesses.
 * Experimental until hardware confirm. Never mutes or routes.
 */
export function CircuitIntelligencePanel({
  intel,
}: {
  intel: CircuitIntelligenceSnapshot;
}) {
  const a = useStudioActions();
  const active = useStudioStore((s) => s.activeCircuitTrack);
  const pos = intel.position;
  const touch = intel.lastTouched;

  const download = () => {
    const json = a.getRuntime().exportCircuitIntelligenceDiagnostic();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `splot-circuit-intelligence-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ci-panel" role="region" aria-label="Circuit Intelligence">
      <div className="ci-head">
        <h2>Circuit Intelligence</h2>
        <span className="ci-badge">experimental</span>
      </div>
      <p className="muted small ci-lead">
        Guesses from Circuit USB MIDI only. Labels are cautious — never auto-mute hardware. Confirm on
        the Circuit before trusting.
      </p>

      <div className="ci-grid-info">
        <div className="ci-card">
          <h3>Musical position</h3>
          <p className="mono">
            {pos.transport === 'playing' ? 'Playing' : pos.transport === 'paused' ? 'Paused' : 'Stopped'}
            {pos.bar > 0 ? (
              <>
                {' '}
                · bar <b>{pos.bar}</b> beat <b>{pos.beat}</b>
              </>
            ) : null}
            {pos.bpm != null ? (
              <>
                {' '}
                · ≈ <b>{pos.bpm}</b> BPM
              </>
            ) : (
              <> · — BPM</>
            )}
          </p>
          {pos.lastProject ? (
            <p className="muted small">
              Last Project {pos.lastProject.index} ({pos.lastProject.kind}) — informational
            </p>
          ) : (
            <p className="muted small">No Project Change heard yet (PC ch16).</p>
          )}
        </div>

        <div className="ci-card">
          <h3>Last-touched track</h3>
          {touch.track != null ? (
            <>
              <p className="mono">
                <b>T{touch.track}</b>
                {touch.knob != null ? ` · macro ${touch.knob + 1}` : null}
                {touch.cc != null ? ` · CC ${touch.cc}` : null}
              </p>
              <p className={`ci-conf ${confidenceToCss(touch.confidence)}`}>
                Confidence: {touch.confidence}
              </p>
              <p className="muted small">{touch.reason}</p>
            </>
          ) : (
            <p className="muted small">Twist a Circuit macro (CC 21–28) to detect the selected track.</p>
          )}
          <label className="ci-autofocus row">
            <input
              type="checkbox"
              checked={intel.autoFocus}
              onChange={(e) => a.getRuntime().setCircuitIntelAutoFocus(e.target.checked)}
            />
            <span className="small">
              Auto-focus Live controller on last-touched
              {active != null ? ` (now T${active})` : ''}
            </span>
          </label>
        </div>
      </div>

      <div className="ci-activity">
        <h3>Track activity</h3>
        <p className="muted small">
          Active / Silent / Possible mute / Possible pattern change / Unknown — guesses only.
        </p>
        <div className="ci-tracks" role="list">
          {intel.tracks.map((tr) => (
            <div
              key={tr.track}
              role="listitem"
              className={`ci-track ${activityToCss(tr.label)}${
                touch.track === tr.track ? ' touched' : ''
              }${active === tr.track ? ' focused' : ''}`}
              title={tr.reason}
            >
              <b>T{tr.track}</b>
              <span className="ci-label">{tr.label}</span>
              <span className={`ci-conf ${confidenceToCss(tr.confidence)}`}>{tr.confidence}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="row ci-actions">
        <button type="button" className="ghost" onClick={() => a.getRuntime().resetCircuitIntelligence()}>
          Clear intelligence
        </button>
        <button type="button" className="ghost" onClick={download}>
          Export intelligence JSON
        </button>
      </div>

      {intel.events.length > 0 ? (
        <div className="ci-events">
          <h3>Recent musical events</h3>
          <ul className="ci-event-list mono small">
            {intel.events.slice(0, 8).map((ev) => (
              <li key={ev.id}>
                <span className={`ci-conf ${confidenceToCss(
                  ev.confidence === 'high'
                    ? 'High'
                    : ev.confidence === 'medium'
                      ? 'Medium'
                      : ev.confidence === 'low'
                        ? 'Low'
                        : 'Unknown',
                )}`}>
                  {ev.confidence}
                </span>{' '}
                {ev.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
