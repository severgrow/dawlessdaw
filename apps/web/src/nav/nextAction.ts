/**
 * Hardware-Feel Pass B — one dominant next-action when MIDI/ports missing.
 * Display helpers only; never enables clock forward or SysEx.
 */

export type NextActionKind = 'allow-midi' | 'assign-ports' | 'ready';

export interface NextAction {
  kind: NextActionKind;
  /** Short label for the primary CTA button. */
  cta: string;
  /** One-line hint (optional; prefer empty when CTA is enough). */
  hint: string;
}

export interface NextActionInput {
  midiReady: boolean;
  midiError: string | null | undefined;
  /** Connected Web MIDI ports. */
  connectedPorts: number;
  /** Onboarding step from runtime. */
  onboardingStep: string;
}

/** Single source of truth for chrome CTAs (StatusBar / Transport / DeviceStrip). */
export function resolveNextAction(input: NextActionInput): NextAction {
  if (!input.midiReady) {
    return {
      kind: 'allow-midi',
      cta: 'Allow MIDI',
      hint: 'Chrome address bar → allow MIDI → reload',
    };
  }
  if (input.connectedPorts === 0 || input.onboardingStep !== 'play') {
    return {
      kind: 'assign-ports',
      cta: 'Assign ports',
      hint: 'Pick Circuit in · Scarlett out',
    };
  }
  return { kind: 'ready', cta: '', hint: '' };
}
