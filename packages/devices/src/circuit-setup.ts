/**
 * Circuit Rhythm setup checklist (Phase 2).
 *
 * Citations: Circuit Rhythm Programmer’s Reference Guide v5 (PRG v5) and
 * User Guide MIDI appendix — Note / CC / Program Change / Clock Tx are
 * independent per the official MIDI channel & transmit tables.
 *
 * https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix
 */

import { CIRCUIT_RHYTHM_DOC } from './circuit-rhythm/midi-map';

export interface CircuitSetupStep {
  id: string;
  title: string;
  /** Exact pad / menu presses in plain English */
  how: string;
  /** What Splot listens for when the tick lights */
  tick: 'note' | 'cc' | 'pc' | 'clock';
  cite: string;
  /** Illustration key under media/phase-2-circuit/ */
  picture: string;
}

export const CIRCUIT_SETUP_STEPS: readonly CircuitSetupStep[] = [
  {
    id: 'usb',
    title: 'Plug Circuit USB into the Mac',
    how: 'Use the Circuit’s USB-B cable → Mac. In Splot Settings → Ports, set Circuit in + out to “Circuit Rhythm”.',
    tick: 'note',
    cite: 'User Guide — USB MIDI',
    picture: 'setup-usb',
  },
  {
    id: 'note-tx',
    title: 'Note Tx on',
    how: 'On Circuit: hold Shift, open MIDI settings (see User Guide MIDI appendix). Set Note Transmit = On for the tracks you sequence out.',
    tick: 'note',
    cite: `${CIRCUIT_RHYTHM_DOC.programmersReference} — Note Tx`,
    picture: 'setup-note-tx',
  },
  {
    id: 'cc-tx',
    title: 'CC Tx on',
    how: 'Same MIDI settings page: Control Change Transmit = On. Macro knobs then send CC 21–28 on the selected track’s channel.',
    tick: 'cc',
    cite: `${CIRCUIT_RHYTHM_DOC.programmersReference} — CC Tx / macros CC 21–28`,
    picture: 'setup-cc-tx',
  },
  {
    id: 'pc-tx',
    title: 'Program Change Tx on (Projects)',
    how: 'MIDI settings: Program Change Transmit = On. Changing Project sends PC on channel 16 (0–63 instant, 64–127 queued). Firmware 2.0.1+.',
    tick: 'pc',
    cite: `${CIRCUIT_RHYTHM_DOC.programmersReference} + sync KB — Project PGM ch16`,
    picture: 'setup-pc-tx',
  },
  {
    id: 'clock-tx',
    title: 'Clock Tx — only if Circuit is clock leader',
    how: 'Pad 32 (Clock Tx) bright when Circuit should lead. Keep Splot “MPC follows Circuit Play” off unless you want app clock. Never two clock leaders.',
    tick: 'clock',
    cite: `${CIRCUIT_RHYTHM_DOC.syncKb} — one clock leader`,
    picture: 'setup-clock-tx',
  },
] as const;

export interface CircuitTxTick {
  count: number;
  lastAt: number | null;
}

export interface CircuitLiveTicks {
  note: CircuitTxTick;
  cc: CircuitTxTick;
  pc: CircuitTxTick;
  clock: CircuitTxTick;
}

export function emptyCircuitLiveTicks(): CircuitLiveTicks {
  const z = (): CircuitTxTick => ({ count: 0, lastAt: null });
  return { note: z(), cc: z(), pc: z(), clock: z() };
}

export function bumpCircuitTick(
  ticks: CircuitLiveTicks,
  kind: keyof CircuitLiveTicks,
  at: number,
): CircuitLiveTicks {
  const cur = ticks[kind];
  return {
    ...ticks,
    [kind]: { count: cur.count + 1, lastAt: at },
  };
}

export const CIRCUIT_SETUP_DONE_KEY = 'dawlessdaw.circuitSetupDone';
export const CONTROLLER_KNOB_PICKUP_KEY = 'dawlessdaw.controllerKnobPickup';
