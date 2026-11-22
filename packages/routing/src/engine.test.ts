import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from './engine';
import type { MidiRoute } from './types';

describe('MidiRoutingEngine', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('routes note-on to destination with transpose', () => {
    const route: MidiRoute = {
      id: 'r1',
      name: 'Circuit → SP',
      enabled: true,
      sourcePortId: 'mock-circuit-in',
      destinations: [{ portId: 'mock-sp404-out' }],
      note: { transpose: 12 },
    };
    engine.setRoutes([route]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    const sent = transport.getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.portId).toBe('mock-sp404-out');
    expect(Array.from(sent[0]!.data)).toEqual([0x90, 72, 100]);
  });

  it('filters channels and remaps', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'ch2 only',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        channel: { allow: [2], remap: { 2: 5 } },
      },
    ]);
    transport.inject('mock-circuit-in', [0x90, 40, 80]); // ch1 — blocked
    transport.inject('mock-circuit-in', [0x91, 40, 80]); // ch2 — ok
    const sent = transport.getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.data[0]).toBe(0x94); // ch5
  });

  it('supports multi-destination', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'fanout',
        enabled: true,
        sourcePortId: 'mock-fm1-in',
        destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
      },
    ]);
    transport.inject('mock-fm1-in', [0x90, 48, 90]);
    expect(transport.getSent()).toHaveLength(2);
  });

  it('prevents feedback to same port and recent echo', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'loop',
        enabled: true,
        sourcePortId: 'mock-mpc-out',
        destinations: [{ portId: 'mock-mpc-out' }],
      },
    ]);
    // same-port dest skipped
    transport.inject('mock-mpc-out', [0x90, 60, 100]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('scales velocity and remaps CC with range', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'vel',
        enabled: true,
        sourcePortId: 'mock-fm1-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        velocity: { scale: 0.5 },
        cc: { map: { 1: 11 }, range: { min: 10, max: 100 } },
      },
    ]);
    transport.inject('mock-fm1-in', [0x90, 60, 100]);
    expect(transport.getSent()[0]!.data[2]).toBe(50);
    transport.clearSent();
    transport.inject('mock-fm1-in', [0xb0, 1, 127]);
    expect(Array.from(transport.getSent()[0]!.data)).toEqual([0xb0, 11, 100]);
  });

  it('respects clock authority', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      {
        id: 'r1',
        name: 'clock',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-sp404-out' }],
        forwardClock: true,
      },
      {
        id: 'r2',
        name: 'other clock',
        enabled: true,
        sourcePortId: 'mock-mpc-in',
        destinations: [{ portId: 'mock-sp404-out' }],
        forwardClock: true,
      },
    ]);
    transport.inject('mock-mpc-in', [0xf8]);
    expect(transport.getSent()).toHaveLength(0);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(transport.getSent()).toHaveLength(1);
  });

  it('cleans up note-offs via allNotesOff', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'n',
        enabled: true,
        sourcePortId: 'mock-fm1-in',
        destinations: [{ portId: 'mock-mpc-out' }],
      },
    ]);
    transport.inject('mock-fm1-in', [0x90, 60, 100]);
    transport.clearSent();
    engine.allNotesOff();
    expect(transport.getSent().length).toBeGreaterThanOrEqual(1);
    expect(transport.getSent()[0]!.data[0]! & 0xf0).toBe(0x80);
  });

  it('skips disabled routes and destinations', () => {
    engine.setRoutes([
      {
        id: 'r1',
        name: 'off',
        enabled: false,
        sourcePortId: 'mock-fm1-in',
        destinations: [{ portId: 'mock-mpc-out' }],
      },
      {
        id: 'r2',
        name: 'dest off',
        enabled: true,
        sourcePortId: 'mock-fm1-in',
        destinations: [{ portId: 'mock-mpc-out', enabled: false }],
      },
    ]);
    transport.inject('mock-fm1-in', [0x90, 60, 100]);
    expect(transport.getSent()).toHaveLength(0);
  });
});
