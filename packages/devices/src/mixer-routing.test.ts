import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildMyStudioRoutes,
  CIRCUIT_MIXER_LEVEL_CC,
  CIRCUIT_MIXER_PAN_CC,
  CIRCUIT_MIXER_TO_DEST_CC,
  circuitMixerCcToDest,
  MIDI_PAN_CC,
  MIDI_VOLUME_CC,
} from './studio-layout';
import { MIXER_LEVEL_CC, MIXER_PAN_CC } from './circuit-rhythm/midi-map';

/**
 * Circuit Mixer Level (CC29) / Pan (CC30) → destination Volume (CC7) / Pan (CC10).
 * Map numbers: confirmed from Circuit Rhythm PRG v5. Live TX + dest response: untested.
 */
describe('circuitMixerCcToDest', () => {
  it('maps Mixer Level CC29 → MIDI Volume CC7', () => {
    expect(CIRCUIT_MIXER_LEVEL_CC).toBe(MIXER_LEVEL_CC);
    expect(circuitMixerCcToDest(29)).toBe(7);
    expect(CIRCUIT_MIXER_TO_DEST_CC[CIRCUIT_MIXER_LEVEL_CC]).toBe(MIDI_VOLUME_CC);
  });

  it('maps Mixer Pan CC30 → MIDI Pan CC10', () => {
    expect(CIRCUIT_MIXER_PAN_CC).toBe(MIXER_PAN_CC);
    expect(circuitMixerCcToDest(30)).toBe(10);
    expect(CIRCUIT_MIXER_TO_DEST_CC[CIRCUIT_MIXER_PAN_CC]).toBe(MIDI_PAN_CC);
  });

  it('returns null for non-mixer CCs (macros, FX, etc.)', () => {
    expect(circuitMixerCcToDest(21)).toBeNull();
    expect(circuitMixerCcToDest(28)).toBeNull();
    expect(circuitMixerCcToDest(7)).toBeNull();
    expect(circuitMixerCcToDest(31)).toBeNull();
  });
});

describe('My Studio: Circuit Mixer → destination volume', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
    engine.setRoutes(
      buildMyStudioRoutes({
        circuitIn: 'mock-circuit-in',
        mpcOut: 'mock-mpc-out',
        spOut: 'mock-sp404-out',
        fm1Out: 'mock-fm1-out',
        circuitT1to4Target: 'both',
      }),
    );
  });

  const sentTo = (portId: string) =>
    transport
      .getSent()
      .filter((m) => m.portId === portId)
      .map((m) => Array.from(m.data));

  it('FM1 Skiff: Mixer Level on tracks 5–8 → CC7 on ch5–8', () => {
    for (const ch of [5, 6, 7, 8]) {
      transport.inject('mock-circuit-in', [0xb0 | (ch - 1), 29, 40 + ch]);
    }
    expect(sentTo('mock-fm1-out')).toEqual([
      [0xb4, 7, 45],
      [0xb5, 7, 46],
      [0xb6, 7, 47],
      [0xb7, 7, 48],
    ]);
  });

  it('FM1 Skiff: Mixer Pan → CC10; unrelated CCs still dropped', () => {
    transport.inject('mock-circuit-in', [0xb4, 30, 64]); // pan ch5
    transport.inject('mock-circuit-in', [0xb4, 31, 100]); // reverb send — not mapped
    expect(sentTo('mock-fm1-out')).toEqual([[0xb4, 10, 64]]);
  });

  it('MPC: Mixer Level on T1–T4 → CC7 on remapped ch9–12', () => {
    for (const track of [1, 2, 3, 4]) {
      transport.inject('mock-circuit-in', [0xb0 | (track - 1), 29, 90]);
    }
    expect(sentTo('mock-mpc-out')).toEqual([
      [0xb8, 7, 90], // ch9
      [0xb9, 7, 90],
      [0xba, 7, 90],
      [0xbb, 7, 90],
    ]);
  });

  it('SP: Mixer Level → CC7; DJ CCs (20–27) still blocked', () => {
    transport.inject('mock-circuit-in', [0xb0, 29, 55]); // T1 level
    transport.inject('mock-circuit-in', [0xb0, 21, 64]); // macro / would be SP DJ CC if passed
    expect(sentTo('mock-sp404-out')).toEqual([[0xb0, 7, 55]]);
  });

  it('does not change note remaps while applying mixer volume', () => {
    transport.inject('mock-circuit-in', [0x94, 60, 100]); // T5 note
    transport.inject('mock-circuit-in', [0xb4, 29, 20]);
    expect(sentTo('mock-fm1-out')).toEqual([
      [0x94, 60, 100],
      [0xb4, 7, 20],
    ]);
  });

  it('h1 firmware still blocks all CCs including mixer', () => {
    engine.setRoutes(
      buildMyStudioRoutes({
        circuitIn: 'mock-circuit-in',
        mpcOut: 'mock-mpc-out',
        spOut: 'mock-sp404-out',
        fm1Out: 'mock-fm1-out',
        fm1Firmware: 'h1',
      }),
    );
    transport.inject('mock-circuit-in', [0xb4, 29, 100]);
    expect(sentTo('mock-fm1-out')).toEqual([]);
  });
});
