import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { circuitTempoView, formatCircuitBpm, type CircuitTempoView } from '../tempo/circuitTempo';

export type CircuitTempoSize = 'strip' | 'panel' | 'jam';

const DISPLAY_HOLD_MS = 500;
const TempoDisplay = createContext<{ view: CircuitTempoView; bpmText: string } | null>(null);

/** Share one stable readout across the transport, Rig and Jam. */
export function CircuitTempoDisplayProvider({ children }: { children: ReactNode }) {
  const health = useStudioStore((s) => s.clockHealth);
  const estimatedBpm = useStudioStore((s) => s.estimatedBpm);
  const midiReady = useStudioStore((s) => s.midiReady);
  const view = circuitTempoView(health, { midiReady, estimatedBpm });
  const candidate = view.bpm == null ? null : Math.round(view.bpm);
  const following = view.phase === 'live' || view.phase === 'variable';
  const lost = view.phase === 'lost';
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!following || candidate == null) {
      if (!lost) setShown(null);
      return;
    }
    if (shown == null) {
      setShown(candidate);
      return;
    }
    if (shown === candidate) return;
    const timer = window.setTimeout(() => setShown(candidate), DISPLAY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [candidate, following, lost, shown]);

  const bpm = following || lost ? shown ?? candidate : null;
  return <TempoDisplay.Provider value={{ view, bpmText: formatCircuitBpm(bpm) }}>{children}</TempoDisplay.Provider>;
}

/** Observe Circuit tempo without affecting playback or clock forwarding. */
export function CircuitTempo({
  size = 'strip',
  showBarBeat = true,
}: {
  size?: CircuitTempoSize;
  showBarBeat?: boolean;
}) {
  const display = useContext(TempoDisplay);
  const appClockOn = useStudioStore((s) => s.anyClockForwarding);
  if (!display) return null;
  const { view, bpmText } = display;

  return (
    <div
      className={`circuit-tempo ct-size-${size} phase-${view.phase}`}
      role="status"
      aria-live="polite"
      aria-label={`Circuit tempo ${bpmText} ${view.label}`}
      title={view.detail}
    >
      <div className="circuit-tempo-main">
        <span className="circuit-tempo-led" aria-hidden="true" />
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
