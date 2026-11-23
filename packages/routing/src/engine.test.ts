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

  it('never forwards SysEx or unparsed bytes, on any route', () => {
    engine.setRoutes([
      {
        id: 'open',
        name: 'no filters at all',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
      },
      {
        id: 'ch1',
        name: 'channel 1 notes',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-fm1-out' }],
        channel: { allow: [1] },
      },
    ]);
    transport.inject('mock-circuit-in', [0xf0, 0x00, 0x20, 0x29, 0x01, 0xf7]);
    transport.inject('mock-circuit-in', [0xf7]);
    expect(transport.getSent()).toEqual([]);
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

  it('forwards start/stop/clock to MPC + SP when forwardClock is true', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      {
        id: 'mystudio-t1',
        name: 'notes',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        channel: { allow: [1] },
        forwardClock: false,
      },
      {
        id: 'mystudio-clock',
        name: 'clock',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
        forwardClock: true,
        blockKinds: ['note-on', 'note-off', 'cc', 'program-change'],
      },
    ]);
    transport.inject('mock-circuit-in', [0xfa]); // start
    transport.inject('mock-circuit-in', [0xf8]); // clock
    transport.inject('mock-circuit-in', [0xfc]); // stop
    const sent = transport.getSent();
    // 3 transport msgs × 2 dests
    expect(sent).toHaveLength(6);
    expect(sent.filter((s) => s.portId === 'mock-mpc-out').map((s) => s.data[0])).toEqual([
      0xfa, 0xf8, 0xfc,
    ]);
    expect(sent.filter((s) => s.portId === 'mock-sp404-out').map((s) => s.data[0])).toEqual([
      0xfa, 0xf8, 0xfc,
    ]);
  });

  it('does not forward clock on note routes with forwardClock false', () => {
    engine.setRoutes([
      {
        id: 'notes',
        name: 'notes',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        forwardClock: false,
      },
    ]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('channel allow filters do not eat realtime F8/FA/FB/FC on the clock route', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      {
        id: 'mystudio-t1',
        name: 'notes ch1',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        channel: { allow: [1], remap: { 1: 9 } },
        forwardClock: false,
      },
      {
        id: 'mystudio-clock',
        name: 'clock',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        forwardClock: true,
        blockKinds: ['note-on', 'note-off', 'cc', 'program-change'],
      },
    ]);
    for (const status of [0xfa, 0xf8, 0xfb, 0xfc]) {
      transport.inject('mock-circuit-in', [status]);
    }
    expect(transport.getSent().map((s) => s.data[0])).toEqual([0xfa, 0xf8, 0xfb, 0xfc]);
  });

  it('sends system realtime without a MIDI timestamp argument', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      {
        id: 'mystudio-clock',
        name: 'clock',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
        forwardClock: true,
      },
    ]);
    const original = transport.send.bind(transport);
    const calls: { data: number[]; timestamp: number | undefined }[] = [];
    transport.send = (portId, data, timestamp?) => {
      calls.push({ data: Array.from(data), timestamp });
      original(portId, data, timestamp);
    };
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.timestamp === undefined)).toBe(true);
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

/**
 * MMT-8 Step 2 — behavioural fixtures (MockMidiTransport + deterministic inject).
 * No firmware / MMT-8 code copied. Strengthens Note On/Off, route-change safety,
 * Start/Stop/Continue, clock authority, active-note cleanup.
 */
describe('MidiRoutingEngine behavioural (MMT-8 Step 2)', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;

  const noteRoute = (dest = 'mock-mpc-out'): MidiRoute => ({
    id: 'notes',
    name: 'notes',
    enabled: true,
    sourcePortId: 'mock-circuit-in',
    destinations: [{ portId: dest }],
    channel: { allow: [1], remap: { 1: 9 } },
    forwardClock: false,
  });

  const clockRoute = (): MidiRoute => ({
    id: 'clock',
    name: 'clock',
    enabled: true,
    sourcePortId: 'mock-circuit-in',
    destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
    forwardClock: true,
    blockKinds: ['note-on', 'note-off', 'cc', 'program-change'],
  });

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('routes Note On then matching Note Off to the remapped channel (no hang)', () => {
    engine.setRoutes([noteRoute()]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]); // ch1 on
    transport.inject('mock-circuit-in', [0x80, 60, 0]); // ch1 off
    const sent = transport.getSent();
    expect(sent).toHaveLength(2);
    expect(Array.from(sent[0]!.data)).toEqual([0x98, 60, 100]); // note-on ch9
    expect(Array.from(sent[1]!.data)).toEqual([0x88, 60, 0]); // note-off ch9
  });

  it('treats note-on velocity 0 as note-off for active-note tracking', () => {
    engine.setRoutes([noteRoute()]);
    transport.inject('mock-circuit-in', [0x90, 48, 90]);
    transport.clearSent();
    transport.inject('mock-circuit-in', [0x90, 48, 0]);
    expect(Array.from(transport.getSent()[0]!.data)).toEqual([0x88, 48, 0]);
    transport.clearSent();
    engine.allNotesOff();
    // already released — nothing left to hang
    expect(transport.getSent()).toHaveLength(0);
  });

  it('releases held notes when routes change mid-hold (no hang)', () => {
    engine.setRoutes([noteRoute('mock-mpc-out')]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    expect(transport.getSent()).toHaveLength(1);
    transport.clearSent();
    // Switch destination while note still held
    engine.setRoutes([noteRoute('mock-sp404-out')]);
    const released = transport.getSent();
    expect(released.length).toBeGreaterThanOrEqual(1);
    expect(released[0]!.portId).toBe('mock-mpc-out');
    expect(released[0]!.data[0]! & 0xf0).toBe(0x80);
    transport.clearSent();
    // Late note-off on old mapping must not resurrect a hang on MPC
    transport.inject('mock-circuit-in', [0x80, 60, 0]);
    const after = transport.getSent();
    expect(after.every((s) => s.portId === 'mock-sp404-out')).toBe(true);
  });

  it('forwards Start / Continue / Stop with clock under authority', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([noteRoute(), clockRoute()]);
    transport.inject('mock-circuit-in', [0xfa]); // Start
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfb]); // Continue
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfc]); // Stop
    const mpc = transport.getSent().filter((s) => s.portId === 'mock-mpc-out').map((s) => s.data[0]);
    expect(mpc).toEqual([0xfa, 0xf8, 0xfb, 0xf8, 0xfc]);
  });

  it('stops forwarding clock when the clock route is disabled (forward-path loss)', () => {
    // Authority null = unrestricted; “clock loss” here means the app stops the
    // forward path (user toggles clock off) — not inventing a second clock master.
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([clockRoute()]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(transport.getSent().length).toBeGreaterThan(0);
    transport.clearSent();
    engine.enableRoute('clock', false);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfc]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('ignores non-authority Start/Continue/Stop (no competing clock leader)', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      {
        id: 'clock-mpc',
        name: 'from mpc',
        enabled: true,
        sourcePortId: 'mock-mpc-in',
        destinations: [{ portId: 'mock-sp404-out' }],
        forwardClock: true,
      },
    ]);
    transport.inject('mock-mpc-in', [0xfa]);
    transport.inject('mock-mpc-in', [0xf8]);
    transport.inject('mock-mpc-in', [0xfb]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('engine.stop() flushes active notes (disconnect / teardown cleanup)', () => {
    engine.setRoutes([noteRoute()]);
    transport.inject('mock-circuit-in', [0x90, 62, 110]);
    transport.clearSent();
    engine.stop();
    const sent = transport.getSent();
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.data[0]! & 0xf0).toBe(0x80);
    expect(sent[0]!.data[1]).toBe(62);
  });

  it('replaySync fixture drives Note On/Off deterministically', () => {
    engine.setRoutes([noteRoute()]);
    transport.replaySync({
      id: 'pair',
      name: 'on/off',
      events: [
        { at: 0, portId: 'mock-circuit-in', data: [0x90, 36, 100] },
        { at: 50, portId: 'mock-circuit-in', data: [0x80, 36, 0] },
      ],
    });
    expect(transport.getSent()).toHaveLength(2);
    expect(transport.getSent()[0]!.data[1]).toBe(36);
    expect(transport.getSent()[1]!.data[0]! & 0xf0).toBe(0x80);
  });
});
