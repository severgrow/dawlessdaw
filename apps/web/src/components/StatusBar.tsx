import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const { midiReady, midiError, ports, onboarding } = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const connected = ports.filter((port) => port.state === 'connected').length;
  const next = resolveNextAction({ midiReady, midiError, connectedPorts: connected, onboardingStep: onboarding.step });

  return (
    <header className="status-bar status-bar--compact">
      <div className="brand" aria-label="Splot MIDI Brain">
        <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" rx="2.5" className="bm-a" />
          <rect x="11" y="1" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="1" y="11" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="11" y="11" width="8" height="8" rx="2.5" className="bm-c" />
        </svg>
        splot<span className="brand-slash"> / </span>midi brain
      </div>
      <button
        type="button"
        className="status-cta midi-port-button"
        data-midi-ready={midiReady}
        data-midi-connected={connected > 0}
        onClick={midiReady ? () => setWorkspace('setup') : onOpenConnect}
        title={midiReady ? 'Open MIDI port setup' : next.hint}
      >
        <span className="midi-port-dot" aria-hidden="true" />
        {midiReady ? `${connected} MIDI ${connected === 1 ? 'port' : 'ports'}` : 'Allow MIDI'}
      </button>
    </header>
  );
}
