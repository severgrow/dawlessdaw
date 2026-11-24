import splotWordmarkBlack from '../assets/brand/splot-wordmark-black.svg';
import splotWordmark from '../assets/brand/splot-wordmark-bone.svg';
import { portsForRoles } from '@dawlessdaw/devices';
import { SONG_TRACKS } from '../arranger/song';
import { songTrackOutputs } from '../arranger/songRoutes';
import { carrySetupRole } from '../nav/uiSelection';
import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const { midiReady, midiError, ports, onboarding, assignments, routes } = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const connected = ports.filter((port) => port.state === 'connected');
  const { circuitIn } = portsForRoles(assignments);
  const circuitReady = connected.some((port) => port.type === 'input' && port.id === circuitIn);
  const routed = new Set(SONG_TRACKS.flatMap((track) =>
    songTrackOutputs(routes, ports, circuitIn, track).filter((out) => out.connected).map((out) => out.portId),
  )).size;
  const next = resolveNextAction({ midiReady, midiError, connectedPorts: connected.length, onboardingStep: onboarding.step });
  const label = !midiReady ? 'Allow MIDI' : !circuitReady ? 'Circuit missing' :
    routed ? `${routed} output${routed === 1 ? '' : 's'} routed` : 'Circuit ready';

  function openMidiStatus() {
    if (!midiReady) {
      onOpenConnect();
      return;
    }
    carrySetupRole(circuitReady ? null : 'circuit', circuitReady ? null : 'Ports · Circuit Rhythm');
    setWorkspace('setup');
  }

  return (
    <header className="status-bar status-bar--compact">
      <div className="splot-brand">
        <picture>
          <source media="(forced-colors: active) and (prefers-color-scheme: light)" srcSet={splotWordmarkBlack} />
          <img className="splot-wordmark" src={splotWordmark} width="1562" height="795" alt="SPLOT" />
        </picture>
        <span className="splot-descriptor">MIDI Brain</span>
      </div>
      <button
        type="button"
        className="status-cta midi-port-button"
        data-midi-ready={midiReady}
        data-midi-connected={circuitReady}
        onClick={openMidiStatus}
        title={!midiReady ? next.hint : circuitReady ? 'Review assigned MIDI ports' : 'Set up the Circuit Rhythm MIDI input'}
      >
        <span className="midi-port-dot" aria-hidden="true" />
        {label}
      </button>
    </header>
  );
}
