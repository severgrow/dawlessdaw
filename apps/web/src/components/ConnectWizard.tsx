import { useEffect, useState } from 'react';
import { loadWizardDismissed, saveWizardDismissed } from '../nav/tabs';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * First-run “Connect your rig” steps. Reopen from Settings.
 * One guided flow instead of stacked warning banners.
 */
export function ConnectWizard({
  forceOpen,
  onClose,
}: {
  forceOpen?: boolean;
  onClose?: () => void;
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

  if (!open && !forceOpen) return null;
  if (!open) return null;

  const step = snap.onboarding.step;
  const close = (dismiss: boolean) => {
    if (dismiss) saveWizardDismissed(true);
    setOpen(false);
    onClose?.();
  };

  return (
    <div className="wizard-scrim" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="wizard-card">
        <h2 id="wizard-title">Connect</h2>
        <p className="lead">Three taps. Reopen anytime from Settings.</p>

        <ol className="wizard-steps">
          <li className={step === 'connect' ? 'current' : snap.midiReady ? 'done' : ''}>
            <b>1. MIDI</b>
            <p className="muted small">
              {snap.midiReady ? 'On.' : snap.midiError ?? 'Allow MIDI when Chrome asks.'}
            </p>
            {!snap.midiReady ? (
              <button type="button" onClick={() => void start()}>
                Allow MIDI
              </button>
            ) : null}
          </li>
          <li className={step === 'identify' || step === 'assign' ? 'current' : step === 'play' ? 'done' : ''}>
            <b>2. Ports</b>
            <p className="muted small">Circuit USB · Scarlett → MPC · FM1 USB · SP optional.</p>
            <div className="row">
              <button type="button" className="ghost" onClick={() => void rescanMidiPorts()}>
                Rescan
              </button>
              <button
                type="button"
                onClick={() => {
                  close(false);
                  setWorkspace('setup');
                }}
              >
                Assign ports
              </button>
            </div>
          </li>
          <li className={step === 'play' ? 'current done' : ''}>
            <b>3. Play</b>
            <p className="muted small">
              {step === 'play' ? 'Ready — hit Play on the Circuit.' : 'Assign Circuit in, then Play.'}
            </p>
          </li>
        </ol>

        {snap.onboarding.message ? (
          <p className="muted small wizard-status" role="status">
            {snap.onboarding.message}
          </p>
        ) : null}

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
