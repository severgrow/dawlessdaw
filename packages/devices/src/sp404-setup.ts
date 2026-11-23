/**
 * SP-404MKII Phase 3 setup checklist + Mode A/B plain-English guide.
 *
 * Stock MIDI Mode A: banks A–J listen on channels 1–10; pads = notes 36–51.
 * Mode B: different channel / pattern behaviour — prefer Mode A for Circuit→pads.
 * Clock: set SP sync to external when Circuit (or thru box) is clock leader.
 *
 * Never flash firmware. USB CDC browse stays read-only (except WAV → SD IMPORT/).
 */

export const SP404_DOC = {
  midiImpl:
    'Roland SP-404MKII MIDI Implementation (effect CTRL CC 16–19 / 80–83; Mode A banks)',
  referenceManual: 'Roland SP-404MKII Reference Manual — SHIFT + pad 14 Import',
  usbProtocol: 'docs/sp404-usb-protocol.md (open404 MIT; FW 5.51 tested)',
} as const;

export type SpSetupTick = 'note' | 'cc' | 'pc' | 'clock';

export interface SpSetupStep {
  id: string;
  title: string;
  how: string;
  tick: SpSetupTick;
  cite: string;
  picture: string;
}

export const SP_SETUP_STEPS: readonly SpSetupStep[] = [
  {
    id: 'usb-midi',
    title: 'Plug SP USB (or DIN clock path)',
    how: 'USB-C data cable → Mac for notes/CC. Clock often arrives via thru box DIN In. In Splot Settings → Ports, set SP out (and in if you use it).',
    tick: 'note',
    cite: SP404_DOC.midiImpl,
    picture: 'setup-usb',
  },
  {
    id: 'mode-a',
    title: 'MIDI Mode A (pads from Circuit notes)',
    how: 'On SP: SHIFT + pad 13 (MIDI) → Mode = A. Banks A–J = MIDI channels 1–10. Pad 1–16 = notes 36–51 on that bank’s channel. Mode B is for other workflows — use A for Circuit→pads.',
    tick: 'note',
    cite: 'Mode A — banks A–J = ch 1–10 · pads notes 36–51',
    picture: 'setup-mode-a',
  },
  {
    id: 'receive-ch',
    title: 'Receive channels match the map',
    how: 'Controller preset Ploe Live: T7→ bank A (ch7), T8→ bank B (ch8) by default — or your own map. SP must listen on those channels (Mode A).',
    tick: 'note',
    cite: 'My Studio / Controller track → SP bank channel',
    picture: 'setup-channels',
  },
  {
    id: 'clock-ext',
    title: 'Clock = external (when Circuit leads)',
    how: 'On SP: sync / MIDI clock = Ext (or Auto) so Play on Circuit starts the SP. Do not also turn Splot app clock→SP on unless you mean to. One clock leader only.',
    tick: 'clock',
    cite: 'SP sync external · thru-box DIN clock common on this rig',
    picture: 'setup-clock',
  },
  {
    id: 'effect-cc',
    title: 'Effect CTRL CCs (name by ear later)',
    how: 'Roland chart: CC 16–19 and 80–83 move effect CTRL knobs. Which physical knob = which CC is unverified here until you finish “Name by ear” and confirm.',
    tick: 'cc',
    cite: SP404_DOC.midiImpl,
    picture: 'setup-fx',
  },
] as const;

export interface SpLiveTick {
  count: number;
  lastAt: number | null;
}

export interface SpLiveTicks {
  note: SpLiveTick;
  cc: SpLiveTick;
  pc: SpLiveTick;
  clock: SpLiveTick;
}

export function emptySpLiveTicks(): SpLiveTicks {
  const z = (): SpLiveTick => ({ count: 0, lastAt: null });
  return { note: z(), cc: z(), pc: z(), clock: z() };
}

export function bumpSpTick(ticks: SpLiveTicks, kind: keyof SpLiveTicks, at: number): SpLiveTicks {
  const cur = ticks[kind];
  return { ...ticks, [kind]: { count: cur.count + 1, lastAt: at } };
}

/** Roland Mode A bank letter → MIDI channel 1–10. */
export const SP_MODE_A_BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type SpModeABank = (typeof SP_MODE_A_BANKS)[number];

export function isSpModeABank(v: string): v is SpModeABank {
  return (SP_MODE_A_BANKS as readonly string[]).includes(v);
}

export function spModeAChannel(bank: SpModeABank): number {
  return SP_MODE_A_BANKS.indexOf(bank) + 1;
}

/** Pad 1–16 on Mode A → MIDI note (no offset). */
export function spModeAPadNote(pad: number): number {
  const p = Math.min(16, Math.max(1, Math.round(pad)));
  return 35 + p; // pad1 = 36
}

/** MIDI note → pad 1–16, or null if outside 36–51. */
export function spModeANoteToPad(note: number, offset = 0): number | null {
  const n = note + offset;
  if (n < 36 || n > 51) return null;
  return n - 35;
}

export const SP_EFFECT_CCS = [16, 17, 18, 19, 80, 81, 82, 83] as const;

export const SP_SETUP_DONE_KEY = 'dawlessdaw.spSetupDone';
export const SP_EFFECT_NAMES_KEY = 'dawlessdaw.spEffectNames';
export const SP_FW_552_ACK_KEY = 'dawlessdaw.spUsb.fw552Ack';
