import splotWordmarkBlack from '../assets/brand/splot-wordmark-black.svg';
import splotWordmark from '../assets/brand/splot-wordmark-bone.svg';
import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const { midiReady, midiError, ports, onboarding } = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const connected = ports.filter((port) => port.state === 'connected').length;
  const next = resolveNextAction({ midiReady, midiError, connectedPorts: connected, onboardingStep: onboarding.step });

  return (
    <header className="status-bar status-bar--compact">
      <div className="splot-brand">
        <picture>
          <source media="(forced-colors: active) and (prefers-color-scheme: light)" srcSet={splotWordmarkBlack} />
          <img className="splot-wordmark" src={splotWordmark} width="1050" height="620" alt="SPLOT" />
        </picture>
        <span className="splot-descriptor">MIDI Brain</span>
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
