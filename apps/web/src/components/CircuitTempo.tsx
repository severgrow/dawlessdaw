import { useMemo } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { circuitTempoView, formatCircuitBpm } from '../tempo/circuitTempo';

export type CircuitTempoSize = 'strip' | 'panel' | 'jam';

/**
 * Circuit tempo follow display — large calm BPM from Circuit MIDI clock.
 * Display only. Does not enable app clock forwarding.
 */
export function CircuitTempo({
  size = 'strip',
  showBarBeat = true,
}: {
  size?: CircuitTempoSize;
  showBarBeat?: boolean;
}) {
  const health = useStudioStore((s) => s.clockHealth);
  const estimatedBpm = useStudioStore((s) => s.estimatedBpm);
  const midiReady = useStudioStore((s) => s.midiReady);
  const appClockOn = useStudioStore((s) => s.anyClockForwarding);

  const view = useMemo(
    () => circuitTempoView(health, { midiReady, estimatedBpm }),
    [health, midiReady, estimatedBpm],
  );

  const bpmText = formatCircuitBpm(view.bpm);

  return (
    <div
      className={`circuit-tempo ct-size-${size} phase-${view.phase}`}
      role="status"
      aria-live="polite"
      aria-label={`Circuit tempo ${bpmText} ${view.label}`}
      title={view.detail}
    >
      <div className="circuit-tempo-main">
        <span className="circuit-tempo-bpm">{bpmText}</span>
        <span className="circuit-tempo-unit">BPM</span>
      </div>
      <div className="circuit-tempo-meta">
        <span className="circuit-tempo-label">{view.label}</span>
        {showBarBeat && view.barBeat ? (
          <span className="circuit-tempo-bar mono">{view.barBeat}</span>
        ) : null}
        {size !== 'strip' ? (
          <span className="circuit-tempo-path muted small">
            {appClockOn ? 'App clock on' : 'Thru / DIN · app clock off'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
