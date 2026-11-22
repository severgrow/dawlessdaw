import { describe, it, expect, beforeEach } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildMyStudioRoutes,
  CIRCUIT_MACRO_TO_SKIFF_CC,
  SKIFF_SOUND_KNOB_CC,
  SKIFF_SOUND_KNOB_STEPS,
} from './studio-layout';
import { matchPortsToRoles, portsForRoles } from './port-matcher';

/**
 * Simulation only — proves the routing logic, not that Skiff responds on real hardware.
 */
describe('Circuit → FM1 (Skiff) routing', () => {
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
      }),
    );
  });

  const sentTo = (portId: string) =>
    transport
      .getSent()
      .filter((m) => m.portId === portId)
      .map((m) => Array.from(m.data));

  it('sends Circuit tracks 5–8 to the FM1 on channels 5–8', () => {
    for (const ch of [5, 6, 7, 8]) {
      transport.inject('mock-circuit-in', [0x90 | (ch - 1), 60, 100]);
    }
    expect(sentTo('mock-fm1-out')).toEqual([
      [0x94, 60, 100],
      [0x95, 60, 100],
      [0x96, 60, 100],
      [0x97, 60, 100],
    ]);
  });

  it('does not send tracks 1–4 to the FM1', () => {
    for (const ch of [1, 2, 3, 4]) {
      transport.inject('mock-circuit-in', [0x90 | (ch - 1), 60, 100]);
    }
    expect(sentTo('mock-fm1-out')).toEqual([]);
  });

  it('translates every Circuit macro knob to its Skiff CC on the same channel', () => {
    for (const [from, to] of Object.entries(CIRCUIT_MACRO_TO_SKIFF_CC)) {
      transport.inject('mock-circuit-in', [0xb6, Number(from), 64]); // ch7
      expect(sentTo('mock-fm1-out').at(-1)).toEqual([0xb6, to, 64]);
    }
    expect(CIRCUIT_MACRO_TO_SKIFF_CC).toEqual({
      21: 74,
      22: 71,
      23: 73,
      24: 75,
      25: 72,
      26: 94,
      27: 91,
    });
  });

  it('macro 8 steps the Skiff track sound with Program Change on its own channel', () => {
    expect(SKIFF_SOUND_KNOB_CC).toBe(28);
    expect(SKIFF_SOUND_KNOB_STEPS).toBe(8);
    transport.inject('mock-circuit-in', [0xb4, 28, 0]); // ch5 → sound 1
    transport.inject('mock-circuit-in', [0xb5, 28, 127]); // ch6 → sound 8
    transport.inject('mock-circuit-in', [0xb6, 28, 64]); // ch7 → sound 5
    transport.inject('mock-circuit-in', [0xb7, 28, 15]); // ch8 → sound 1
    expect(sentTo('mock-fm1-out')).toEqual([
      [0xc4, 0],
      [0xc5, 7],
      [0xc6, 4],
      [0xc7, 0],
    ]);
  });

  it('only sends a Program Change when the sound knob crosses into a new sound', () => {
    for (let v = 0; v <= 127; v++) transport.inject('mock-circuit-in', [0xb4, 28, v]);
    expect(sentTo('mock-fm1-out')).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((p) => [0xc4, p]));
    // Turning back down re-sends as each zone is re-entered
    transport.inject('mock-circuit-in', [0xb4, 28, 0]);
    expect(sentTo('mock-fm1-out').at(-1)).toEqual([0xc4, 0]);
  });

  it('each track remembers its own sound (ch5 does not block ch6)', () => {
    transport.inject('mock-circuit-in', [0xb4, 28, 40]);
    transport.inject('mock-circuit-in', [0xb5, 28, 40]);
    expect(sentTo('mock-fm1-out')).toEqual([
      [0xc4, 2],
      [0xc5, 2],
    ]);
  });

  it('drops any other CC so it cannot change Skiff by accident', () => {
    transport.inject('mock-circuit-in', [0xb4, 29, 100]); // mixer CC on ch5
    transport.inject('mock-circuit-in', [0xb4, 74, 100]); // already a Skiff CC — still dropped
    expect(sentTo('mock-fm1-out')).toEqual([]);
  });

  it('never forwards Circuit Program Change to the FM1', () => {
    transport.inject('mock-circuit-in', [0xc4, 3]);
    expect(sentTo('mock-fm1-out')).toEqual([]);
  });
});

describe('Skiff port naming', () => {
  it('matches a port named Skiff to the FM1', () => {
    const ports: MidiPortInfo[] = [
      { id: 'cr-in', name: 'Circuit Rhythm', type: 'input', state: 'connected' },
      { id: 'sk-in', name: 'Skiff', type: 'input', state: 'connected' },
      { id: 'sk-out', name: 'Skiff', type: 'output', state: 'connected' },
    ];
    expect(portsForRoles(matchPortsToRoles(ports)).fm1Out).toBe('sk-out');
  });
});

describe('Circuit T1–T4 → SP-404 banks A–D (MIDI Mode A)', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;

  const setup = async (target: 'mpc' | 'sp' | 'both', spNoteOffset?: number) => {
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
        circuitT1to4Target: target,
        spNoteOffset,
      }),
    );
  };
  const sentTo = (portId: string) =>
    transport
      .getSent()
      .filter((m) => m.portId === portId)
      .map((m) => Array.from(m.data));

  it('keeps each track on its own channel (= bank) and shifts notes to pads', async () => {
    await setup('sp');
    transport.inject('mock-circuit-in', [0x90, 60, 100]); // T1, note 60
    transport.inject('mock-circuit-in', [0x93, 61, 90]); // T4, note 61
    expect(sentTo('mock-sp404-out')).toEqual([
      [0x90, 36, 100], // bank A pad 1
      [0x93, 37, 90], // bank D pad 2
    ]);
    expect(sentTo('mock-mpc-out')).toEqual([]);
  });

  it('uses a learned offset', async () => {
    await setup('sp', 36 - 48);
    transport.inject('mock-circuit-in', [0x91, 48, 100]); // T2 note 48 → pad 1
    expect(sentTo('mock-sp404-out')).toEqual([[0x91, 36, 100]]);
  });

  it('never sends knobs or Program Change to the SP', async () => {
    await setup('sp');
    transport.inject('mock-circuit-in', [0xb0, 21, 100]); // CC21 = SP DJ-mode control
    transport.inject('mock-circuit-in', [0xc0, 2]);
    expect(sentTo('mock-sp404-out')).toEqual([]);
  });

  it('"both" plays the MPC and the SP', async () => {
    await setup('both');
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    expect(sentTo('mock-sp404-out')).toEqual([[0x90, 36, 100]]);
    expect(sentTo('mock-mpc-out')).toEqual([[0x98, 60, 100]]); // ch9
  });

  it('defaults to MPC only', async () => {
    await setup('mpc');
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    expect(sentTo('mock-sp404-out')).toEqual([]);
  });
});
