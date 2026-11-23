import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CircuitTempo } from './CircuitTempo';

/**
 * Compact transport (Pass B). CONNECT reopens the Connect wizard.
 * Status text is muted when the StatusBar CTA already owns the next action.
 * Circuit tempo is display-only — never toggles app clock forward.
 */
export function TransportStrip({
  onOpenJam,
  onOpenConnect,
}: {
  onOpenJam?: () => void;
  onOpenConnect?: () => void;
}) {
  const snap = useStudioStore();
  const { panic, seqPlay, seqStop } = useStudioActions();
  const playing = snap.sequencer.playing;
  const connected = snap.ports.filter((p) => p.state === 'connected').length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts: connected,
    onboardingStep: snap.onboarding.step,
  });

  // When blocked, StatusBar owns the words — keep strip quiet.
  const status =
    next.kind !== 'ready'
      ? null
      : snap.onboarding.step !== 'play'
        ? snap.onboarding.message
        : snap.statusLine;

  return (
    <div className="transport-strip" role="region" aria-label="Transport">
      <div className="ts-cluster" role="group" aria-label="Transport controls">
        <button
          type="button"
          className={`ts-btn ts-play${playing ? ' on' : ''}`}
          onClick={() => seqPlay()}
          title="Play"
        >
          <span className="ts-glyph" aria-hidden />
          Play
        </button>
        <button type="button" className="ts-btn ts-stop" onClick={() => seqStop()} title="Stop">
          <span className="ts-glyph" aria-hidden />
          Stop
        </button>
        <button
          type="button"
          className="ts-btn ts-panic danger"
          onClick={() => panic()}
          title="All notes off"
        >
          Panic
        </button>
        {onOpenJam ? (
          <button type="button" className="ts-btn ts-jam jam" onClick={onOpenJam} title="Jam (J)">
            Jam
          </button>
        ) : null}
      </div>
      <CircuitTempo size="strip" showBarBeat={next.kind === 'ready'} />
      {status ? (
        <span className="ts-status" title={status}>
          {status}
        </span>
      ) : (
        <span className="ts-status ts-status-quiet" aria-hidden="true" />
      )}
      {next.kind !== 'ready' ? (
        <button
          type="button"
          className="ts-btn ts-connect"
          onClick={() => onOpenConnect?.()}
          title={next.hint || 'Open Connect'}
        >
          Connect
        </button>
      ) : null}
    </div>
  );
}
