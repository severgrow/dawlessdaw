import { describe, it, expect, beforeEach } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import { buildMyStudioRoutes, CIRCUIT_MACRO_TO_SKIFF_CC } from './studio-layout';
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
      28: 7,
    });
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
