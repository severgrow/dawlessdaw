import { describe, it } from 'vitest';

/**
 * Real-hardware integration tests — pending.
 * Run manually on macOS Chrome with MPC One / SP-404MKII / Circuit / FM1 attached.
 */
describe.skip('real hardware (pending)', () => {
  it('enumerates MPC One ports via Web MIDI', () => {
    // pending: requires physical Akai MPC One + Chrome user gesture
  });

  it('receives note/CC from SP-404MKII stock firmware', () => {
    // pending
  });

  it('maps Circuit Rhythm track channels to role bindings', () => {
    // pending
  });

  it('passes generic MIDI from M-VAVE FM1', () => {
    // pending
  });

  it('does not claim MIDI for ZED-10FX', () => {
    // pending — verify absence of MIDI ports only
  });
});
