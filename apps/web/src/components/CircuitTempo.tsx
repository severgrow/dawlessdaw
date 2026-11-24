import { useMemo } from 'react';
import { useStudioStore, useStudioActions } from '../store/useStudioStore';
import { circuitTempoViewFromClock, formatCircuitBpm } from '../tempo/circuitTempo';

export type CircuitTempoSize = 'strip' | 'panel' | 'jam';

/**
 * Circuit tempo follow display — large calm BPM from shared ClockService.
 * Display only. Does not enable app clock forwarding.
 */
export function CircuitTempo({
  size = 'strip',
  showBarBeat = true,
}: {
  size?: CircuitTempoSize;
  showBarBeat?: boolean;
}) {
  // Store subscription for re-render; display reads shared ClockService seam.
  const health = useStudioStore((s) => s.clockHealth);
  const { getRuntime } = useStudioActions();
  const playback = useStudioStore((s) => s.songPlayback);
  const estimatedBpm = useStudioStore((s) => s.estimatedBpm);
  const midiReady = useStudioStore((s) => s.midiReady);
  const appClockOn = useStudioStore((s) => s.anyClockForwarding);

  const view = useMemo(
    () =>
      circuitTempoViewFromClock(getRuntime().getClockService(), {
        midiReady,
        estimatedBpm,
      }),
    [getRuntime, midiReady, estimatedBpm, health],
  );

  const bpm = playback ? playback.bpm : view.bpm;
  const bpmText = formatCircuitBpm(bpm == null ? null : Math.round(bpm));
  const label = playback ? (playback.source === 'song' ? 'SPLOT · Song playing' : playback.source === 'part' ? 'SPLOT · Part preview' : 'SPLOT · Looping')
    : view.phase === 'live' ? (health.position?.transport === 'playing' ? 'Circuit · Live' : 'Circuit · Locked')
      : view.label;

  return (
    <div
      className={`circuit-tempo ct-size-${size} phase-${playback ? 'live' : view.phase}`}
      role="status"
      aria-live="polite"
      aria-label={`${bpmText} BPM · ${label}`}
      title={playback ? 'SPLOT is playing MIDI through Circuit track routes.' : view.detail}
    >
      <div className="circuit-tempo-main">
        <span className="circuit-tempo-bpm">{bpmText}</span>
        <span className="circuit-tempo-unit">BPM</span>
      </div>
      <div className="circuit-tempo-meta">
        <span className="circuit-tempo-label">{label}</span>
        {!playback && showBarBeat && view.barBeat ? (
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
