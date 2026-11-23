import splotIcon from '../assets/brand/splot-icon-bone-transparent.svg';
import { useEffect, useState } from 'react';
import { loadWizardDismissed, saveWizardDismissed } from '../nav/tabs';
import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * First-run Connect flow (Pass B). One guided path — reopen via CONNECT.
 * Less copy; one dominant CTA. Does not enable app clock forward.
 */
export function ConnectWizard({
  forceOpen,
  onClose,
  onOpenChange,
}: {
  forceOpen?: boolean;
  onClose?: () => void;
  /** StatusBar hides its CTA while the wizard owns the next-action. */
  onOpenChange?: (open: boolean) => void;
}) {
  const snap = useStudioStore();
  const { setWorkspace, rescanMidiPorts, start } = useStudioActions();
  const [open, setOpen] = useState(() => !loadWizardDismissed() && snap.onboarding.step !== 'play');

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (loadWizardDismissed()) return;
    if (snap.onboarding.step !== 'play') setOpen(true);
  }, [snap.onboarding.step]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  if (!open) return null;

  const connected = snap.ports.filter((p) => p.state === 'connected').length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts: connected,
    onboardingStep: snap.onboarding.step,
  });

  const close = (dismiss: boolean) => {
    if (dismiss) saveWizardDismissed(true);
    setOpen(false);
    onClose?.();
  };

  const allowMidi = () => {
    void start().then(() => {
      // Browser may require a reload after permission grant.
      void rescanMidiPorts();
    });
  };

  return (
    <div className="wizard-scrim" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="wizard-card">
        <div className="splot-connect-heading">
          <img className="splot-small-icon" src={splotIcon} width="24" height="24" alt="" />
          <h2 id="wizard-title">Connect</h2>
        </div>
        <p className="lead">One path. Reopen with Connect anytime.</p>

        {next.kind === 'allow-midi' ? (
          <div className="wizard-focus">
            <p className="wizard-focus-hint muted small">{next.hint}</p>
            <button type="button" className="wizard-cta" onClick={allowMidi}>
              {next.cta}
            </button>
          </div>
        ) : (
          <ol className="wizard-steps">
            <li className="done">
              <b>1. MIDI</b>
              <p className="muted small">On.</p>
            </li>
            <li className={next.kind === 'assign-ports' ? 'current' : 'done'}>
              <b>2. Ports</b>
              <p className="muted small">Circuit · Scarlett · FM1 · SP</p>
              <div className="row">
                <button type="button" className="ghost" onClick={() => void rescanMidiPorts()}>
                  Rescan
                </button>
                <button
                  type="button"
                  className="wizard-cta"
                  onClick={() => {
                    close(false);
                    setWorkspace('setup');
                  }}
                >
                  {next.cta || 'Assign ports'}
                </button>
              </div>
            </li>
            <li className={next.kind === 'ready' ? 'current done' : ''}>
              <b>3. Play</b>
              <p className="muted small">
                {next.kind === 'ready' ? 'Hit Play on the Circuit.' : 'After ports — Play on Circuit.'}
              </p>
            </li>
          </ol>
        )}

        <div className="row wizard-actions">
          <button type="button" className="ghost" onClick={() => close(true)}>
            Don’t show again
          </button>
          <button type="button" onClick={() => close(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
