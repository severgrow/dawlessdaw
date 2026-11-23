/**
 * MPC DIN Setup — progressive next-action (research rank 1).
 * Scarlett Out → MPC In; USB-B clock is useless. Never enables clock by default.
 */

import {
  looksLikeAkaiMpcUsbPort,
  looksLikeMidiInterfaceOut,
  mpcClockPortAdvice,
} from '@dawlessdaw/devices';

export const MPC_DIN_CABLE_KEY = 'dawlessdaw.mpcDin.cableConfirmed';
export const MPC_DIN_PREFS_KEY = 'dawlessdaw.mpcDin.devicePrefsConfirmed';

export type MpcDinStepId =
  | 'app-sends-notes'
  | 'ports-scarlett'
  | 'cable'
  | 'usb-b-honesty'
  | 'mpc-device-prefs'
  | 'clock-follow-optin'
  | 'ready';

export interface MpcDinSetupInput {
  /** Studio mpcNoteMode: 'usb' = app sends notes; 'din-only' = thru box only. */
  mpcNoteMode: 'usb' | 'din-only';
  mpcOutPortName: string | null;
  /** Opt-in transport forward — never implied by DIN checklist alone. */
  clockToMpc: boolean;
  /** User confirmed Scarlett MIDI Out → MPC MIDI In cable. */
  cableConfirmed: boolean;
  /** User confirmed MPC MIDI/Sync + track ch 9–12 + monitoring In. */
  devicePrefsConfirmed: boolean;
}

export interface MpcDinNextAction {
  step: MpcDinStepId;
  /** Short primary CTA / headline. */
  cta: string;
  /** One supporting line. */
  hint: string;
  /** Strong honesty when MPC USB is selected for Out. */
  usbBUseless: boolean;
  /** Port advice kind from devices package. */
  portAdviceKind: ReturnType<typeof mpcClockPortAdvice>['kind'];
  portAdviceMessage: string;
  /** Progress 0…n for UI (completed steps before current). */
  progressIndex: number;
  progressTotal: number;
}

const STEPS_ORDER: MpcDinStepId[] = [
  'app-sends-notes',
  'ports-scarlett',
  'cable',
  'usb-b-honesty',
  'mpc-device-prefs',
  'clock-follow-optin',
  'ready',
];

export function isScarlettLikeOut(name: string | null | undefined): boolean {
  return looksLikeMidiInterfaceOut(name);
}

export function isAkaiUsbOut(name: string | null | undefined): boolean {
  return looksLikeAkaiMpcUsbPort(name);
}

/**
 * One dominant next step for Configure · MPC.
 * Does **not** turn on clockToMpc — only nudges after DIN path is sane.
 */
export function resolveMpcDinNextAction(input: MpcDinSetupInput): MpcDinNextAction {
  const advice = mpcClockPortAdvice(input.mpcOutPortName);
  const usbBUseless = advice.kind === 'warn-akai-usb';

  const base = {
    usbBUseless,
    portAdviceKind: advice.kind,
    portAdviceMessage: advice.message,
    progressTotal: STEPS_ORDER.length - 1, // exclude ready from "work" total
  };

  if (input.mpcNoteMode !== 'usb') {
    return {
      ...base,
      step: 'app-sends-notes',
      cta: 'App sends notes',
      hint: 'Thru-box mode sends the MPC nothing from Splot. Switch to App sends notes for Scarlett→DIN.',
      progressIndex: 0,
    };
  }

  if (!input.mpcOutPortName || advice.kind === 'unset') {
    return {
      ...base,
      step: 'ports-scarlett',
      cta: 'MPC Out = Scarlett',
      hint: 'Assign Akai MPC One → MIDI out to Scarlett 2i4 (or another interface DIN Out). Not the “MPC One” USB port.',
      progressIndex: 1,
    };
  }

  if (usbBUseless) {
    return {
      ...base,
      step: 'usb-b-honesty',
      cta: 'USB-B clock is useless',
      hint: 'Akai USB-B ignores MIDI Clock from a computer — the sequencer will not start. Switch MPC Out to Scarlett → DIN In.',
      progressIndex: 1,
    };
  }

  if (!isScarlettLikeOut(input.mpcOutPortName) && advice.kind !== 'ok-interface') {
    return {
      ...base,
      step: 'ports-scarlett',
      cta: 'Confirm DIN interface',
      hint: advice.message,
      progressIndex: 1,
    };
  }

  if (!input.cableConfirmed) {
    return {
      ...base,
      step: 'cable',
      cta: 'Cable Scarlett → MPC',
      hint: 'Scarlett MIDI Out → MPC MIDI In (3.5 mm → 5-pin adapter on the MPC). Then confirm.',
      progressIndex: 2,
    };
  }

  if (!input.devicePrefsConfirmed) {
    return {
      ...base,
      step: 'mpc-device-prefs',
      cta: 'Set MPC MIDI / Sync',
      hint: 'Receive = MIDI Clock on MIDI In. Tracks 1–4: ch 9/10/11/12, monitoring In (not All / not Auto).',
      progressIndex: 3,
    };
  }

  if (!input.clockToMpc) {
    return {
      ...base,
      step: 'clock-follow-optin',
      cta: 'Optional: MPC follows Circuit Play',
      hint: 'Opt-in only — sends clock/start/stop to Scarlett→DIN. Leave off if you only need notes. Never default-on.',
      progressIndex: 4,
    };
  }

  return {
    ...base,
    step: 'ready',
    cta: 'DIN path ready',
    hint: 'Experimental until Bench g2/g3 Pass. Circuit Play should start the MPC sequencer when follow is On.',
    progressIndex: 5,
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadMpcDinCableConfirmed(storage: StorageLike | null = browserStorage()): boolean {
  try {
    return storage?.getItem(MPC_DIN_CABLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMpcDinCableConfirmed(
  on: boolean,
  storage: StorageLike | null = browserStorage(),
): void {
  try {
    storage?.setItem(MPC_DIN_CABLE_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

export function loadMpcDinPrefsConfirmed(storage: StorageLike | null = browserStorage()): boolean {
  try {
    return storage?.getItem(MPC_DIN_PREFS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMpcDinPrefsConfirmed(
  on: boolean,
  storage: StorageLike | null = browserStorage(),
): void {
  try {
    storage?.setItem(MPC_DIN_PREFS_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}
