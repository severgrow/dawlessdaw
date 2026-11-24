import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CircuitTempo } from './CircuitTempo';

/**
 * Transport cluster — instrument affordances (Play triangle / Stop square / Panic outline).
 * Circuit tempo is display-only — never toggles app clock forward.
 */
export function TransportStrip({
  onOpenJam,
  onOpenConnect,
  compact = false,
  hideConnect = false,
}: {
  onOpenJam?: () => void;
  onOpenConnect?: () => void;
  compact?: boolean;
  /** When true, do not show Connect (wizard open or StatusBar owns CTA). */
  hideConnect?: boolean;
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

  const showConnect = !hideConnect && next.kind !== 'ready';

  return (
    <div
      className={`transport-strip${compact ? ' transport-strip--compact' : ''}`}
      role="region"
      aria-label="Transport"
    >
      <div className="ts-cluster" role="group" aria-label="Transport controls">
        <button
          type="button"
          className={`ts-btn ts-play${playing ? ' on' : ''}`}
          onClick={() => seqPlay()}
          title="Play Splot pattern"
          aria-label="Play"
        >
          <span className="ts-glyph" aria-hidden />
          <span className="ts-label">Play</span>
        </button>
        <button
          type="button"
          className="ts-btn ts-stop"
          onClick={() => seqStop()}
          title="Stop Splot playback"
          aria-label="Stop"
        >
          <span className="ts-glyph" aria-hidden />
          <span className="ts-label sr-only">Stop</span>
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
      {showConnect ? (
        <button
          type="button"
          className="ts-btn ts-connect"
          onClick={() => onOpenConnect?.()}
          title={next.hint || 'Open Connect'}
        >
          {next.cta || 'Connect'}
        </button>
      ) : null}
    </div>
  );
}
