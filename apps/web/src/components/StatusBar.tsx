import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * Brand + midi honesty chip. v3 compact: sits in the single chrome baseline.
 * Does not repeat Connect when Transport owns the CTA.
 */
export function StatusBar({
  onOpenConnect,
  connectOpen,
  compact = false,
}: {
  onOpenConnect?: () => void;
  /** When Connect wizard is open, hide competing CTA (wizard owns it). */
  connectOpen?: boolean;
  /** v3: brand + badge only — CTA lives on Transport. */
  compact?: boolean;
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

  const showChromeCta = !compact && next.kind !== 'ready' && !connectOpen;

  return (
    <header className={`status-bar${compact ? ' status-bar--compact' : ''}`}>
      <div className="brand" aria-label="Splot MIDI Brain">
        <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" rx="2.5" className="bm-a" />
          <rect x="11" y="1" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="1" y="11" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="11" y="11" width="8" height="8" rx="2.5" className="bm-c" />
        </svg>
        splot<span className="brand-slash"> / </span>midi brain
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
      {!compact && snap.midiReady && snap.statusLine ? (
        <span className="status-line" title={snap.statusLine}>
          {snap.statusLine.length > 64 ? `${snap.statusLine.slice(0, 61)}…` : snap.statusLine}
        </span>
      ) : null}
      {!compact ? <span className="spacer" /> : null}
      {showChromeCta ? (
        <button
          type="button"
          className="status-cta"
          onClick={onCta}
          title={next.hint || next.cta}
        >
          {next.cta}
        </button>
      ) : !compact && next.kind === 'ready' ? (
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
