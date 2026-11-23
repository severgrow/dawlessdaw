import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * Header chrome (Pass B). One status signal + optional next-action CTA.
 * Does not repeat long “No MIDI — allow in Chrome” strings across the app.
 */
export function StatusBar({
  onOpenConnect,
  connectOpen,
}: {
  onOpenConnect?: () => void;
  /** When Connect wizard is open, hide competing CTA (wizard owns it). */
  connectOpen?: boolean;
}) {
  const snap = useStudioStore();
  const { rescanMidiPorts, start } = useStudioActions();
  const connected = snap.ports.filter((p) => p.state === 'connected').length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts: connected,
    onboardingStep: snap.onboarding.step,
  });

  const onCta = () => {
    if (next.kind === 'allow-midi') {
      if (onOpenConnect) onOpenConnect();
      else void start();
      return;
    }
    if (next.kind === 'assign-ports') {
      onOpenConnect?.();
    }
  };

  const showChromeCta = next.kind !== 'ready' && !connectOpen;

  return (
    <header className="status-bar">
      <div className="brand" aria-label="Splot MIDI Brain">
        <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" rx="2.5" className="bm-a" />
          <rect x="11" y="1" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="1" y="11" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="11" y="11" width="8" height="8" rx="2.5" className="bm-c" />
        </svg>
        splot<span className="brand-slash"> / </span>midi brain
        <span className="cursor" aria-hidden="true" />
      </div>
      <div
        className={snap.midiReady ? 'sim-badge live-badge' : 'sim-badge error-badge'}
        title={next.kind === 'allow-midi' ? next.hint : undefined}
      >
        <span className="dot" />
        {snap.midiReady ? 'midi' : 'no midi'}
      </div>
      {snap.midiReady ? (
        <span className="readout">
          ports <b>{connected}</b>
        </span>
      ) : null}
      {snap.anyClockForwarding ? (
        <span className="readout" title={snap.clockActivity.hint}>
          clk <b>{snap.clockActivity.inTicks}</b>↓ <b>{snap.clockActivity.outTicks}</b>↑
        </span>
      ) : null}
      {snap.midiReady && snap.statusLine ? (
        <span className="status-line" title={snap.statusLine}>
          {snap.statusLine.length > 64 ? `${snap.statusLine.slice(0, 61)}…` : snap.statusLine}
        </span>
      ) : null}
      <span className="spacer" />
      {showChromeCta ? (
        <button
          type="button"
          className="status-cta"
          onClick={onCta}
          title={next.hint || next.cta}
        >
          {next.cta}
        </button>
      ) : next.kind === 'ready' ? (
        <button
          type="button"
          onClick={() => void rescanMidiPorts()}
          title="Ask Chrome for the MIDI port list again"
        >
          Rescan
        </button>
      ) : null}
    </header>
  );
}
