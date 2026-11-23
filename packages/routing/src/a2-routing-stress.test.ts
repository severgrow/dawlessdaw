import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from './engine';
import type { MidiRoute } from './types';

/**
 * A2 — MIDI routing stress (deterministic Vitest + MockMidiTransport).
 * Extends MMT-8 Step 2 behavioural coverage: hanging notes, route changes,
 * duplicates, feedback/clock loops, lost Note Off, bad ports, disconnect,
 * rapid enable/disable, panic, unexpected PC, reconnect during transport.
 * Does not change clock-forward defaults (forwardClock === false still required
 * to suppress clock; note routes in fixtures set forwardClock: false).
 */
describe('A2 MIDI routing stress', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;

  const notes = (overrides: Partial<MidiRoute> = {}): MidiRoute => ({
    id: 'notes',
    name: 'notes',
    enabled: true,
    sourcePortId: 'mock-circuit-in',
    destinations: [{ portId: 'mock-mpc-out' }],
    channel: { allow: [1], remap: { 1: 9 } },
    forwardClock: false,
    ...overrides,
  });

  const clock = (overrides: Partial<MidiRoute> = {}): MidiRoute => ({
    id: 'clock',
    name: 'clock',
    enabled: true,
    sourcePortId: 'mock-circuit-in',
    destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
    forwardClock: true,
    blockKinds: ['note-on', 'note-off', 'cc', 'program-change'],
    ...overrides,
  });

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('hanging notes: lost Note Off is cleared by panic (allNotesOff)', () => {
    engine.setRoutes([notes()]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    // Note Off never arrives
    transport.clearSent();
    engine.allNotesOff();
    const sent = transport.getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.portId).toBe('mock-mpc-out');
    expect(sent[0]!.data[0]! & 0xf0).toBe(0x80);
    expect(sent[0]!.data[1]).toBe(60);
    transport.clearSent();
    engine.allNotesOff();
    expect(transport.getSent()).toHaveLength(0);
  });

  it('route change while held releases old dest before new routing', () => {
    engine.setRoutes([notes({ destinations: [{ portId: 'mock-mpc-out' }] })]);
    transport.inject('mock-circuit-in', [0x90, 48, 110]);
    transport.clearSent();
    engine.setRoutes([notes({ destinations: [{ portId: 'mock-sp404-out' }] })]);
    expect(transport.getSent()[0]!.portId).toBe('mock-mpc-out');
    expect(transport.getSent()[0]!.data[0]! & 0xf0).toBe(0x80);
    transport.clearSent();
    transport.inject('mock-circuit-in', [0x90, 50, 90]);
    expect(transport.getSent()[0]!.portId).toBe('mock-sp404-out');
  });

  it('duplicate Note Ons then one Note Off leave no hang', () => {
    engine.setRoutes([notes()]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    transport.inject('mock-circuit-in', [0x90, 60, 80]); // re-strike
    transport.clearSent();
    transport.inject('mock-circuit-in', [0x80, 60, 0]);
    expect(transport.getSent()).toHaveLength(1);
    expect(transport.getSent()[0]!.data[0]! & 0xf0).toBe(0x80);
    transport.clearSent();
    engine.allNotesOff();
    expect(transport.getSent()).toHaveLength(0);
  });

  it('feedback: same-port destination is skipped; recent echo is suppressed', () => {
    engine.setRoutes([
      {
        id: 'loop',
        name: 'loop',
        enabled: true,
        sourcePortId: 'mock-mpc-out',
        destinations: [{ portId: 'mock-mpc-out' }],
        forwardClock: false,
      },
    ]);
    transport.inject('mock-mpc-out', [0x90, 60, 100]);
    expect(transport.getSent()).toHaveLength(0);

    // Cross-port then immediate echo on the dest portId we just wrote
    engine.setRoutes([notes()]);
    transport.inject('mock-circuit-in', [0x90, 61, 100]);
    expect(transport.getSent()).toHaveLength(1);
    const echoTs = transport.getSent()[0]!.timestamp;
    transport.clearSent();
    transport.inject('mock-mpc-out', [0x90, 61, 100], echoTs + 1);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('clock loops: authority + forwardClock false on note routes prevent competing leaders', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      notes(),
      clock(),
      {
        id: 'back-clock',
        name: 'mpc → circuit (would loop)',
        enabled: true,
        sourcePortId: 'mock-mpc-in',
        destinations: [{ portId: 'mock-circuit-out' }],
        forwardClock: true,
      },
    ]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    const forward = transport.getSent().map((s) => s.data[0]);
    expect(forward).toContain(0xfa);
    expect(forward).toContain(0xf8);
    transport.clearSent();
    // Competing Start/Clock from non-authority must not forward
    transport.inject('mock-mpc-in', [0xfa]);
    transport.inject('mock-mpc-in', [0xf8]);
    expect(transport.getSent()).toHaveLength(0);
    // Note route must not smuggle clock
    transport.inject('mock-circuit-in', [0xf8]);
    const onlyClockRoute = transport.getSent().every(
      (s) => s.portId === 'mock-mpc-out' || s.portId === 'mock-sp404-out',
    );
    expect(onlyClockRoute).toBe(true);
  });

  it('bad / disconnected destination port does not throw; panic stays safe', () => {
    transport.setPortConnected('mock-mpc-out', false);
    engine.setRoutes([notes()]);
    expect(() => transport.inject('mock-circuit-in', [0x90, 40, 100])).not.toThrow();
    expect(transport.getSent()).toHaveLength(0); // Mock drops disconnected outputs
    expect(() => engine.allNotesOff()).not.toThrow();
  });

  it('disconnect during playback: releaseNotesForPort then drop further sends', () => {
    engine.setRoutes([notes()]);
    transport.inject('mock-circuit-in', [0x90, 62, 100]);
    transport.clearSent();
    engine.releaseNotesForPort('mock-mpc-out');
    expect(transport.getSent()).toHaveLength(1);
    expect(transport.getSent()[0]!.data[0]! & 0xf0).toBe(0x80);
    transport.clearSent();
    transport.setPortConnected('mock-mpc-out', false);
    transport.inject('mock-circuit-in', [0x90, 64, 100]);
    // Engine still transforms, but Mock (like Web MIDI) drops disconnected output
    expect(transport.getSent()).toHaveLength(0);
  });

  it('rapid enable/disable while held flushes notes (no hang)', () => {
    engine.setRoutes([notes()]);
    for (let i = 0; i < 8; i++) {
      transport.inject('mock-circuit-in', [0x90, 36 + (i % 4), 100]);
      engine.enableRoute('notes', false);
      engine.enableRoute('notes', true);
    }
    transport.clearSent();
    engine.allNotesOff();
    // Last enable left a note held — panic must clear it; if disable failed to
    // flush earlier, we would still only see the current hold set.
    expect(transport.getSent().every((s) => (s.data[0]! & 0xf0) === 0x80)).toBe(true);
    // After a final disable with a hold, nothing remains
    transport.inject('mock-circuit-in', [0x90, 70, 100]);
    transport.clearSent();
    engine.enableRoute('notes', false);
    expect(transport.getSent().length).toBeGreaterThanOrEqual(1);
    transport.clearSent();
    engine.allNotesOff();
    expect(transport.getSent()).toHaveLength(0);
  });

  it('panic (allNotesOff) clears multi-dest fanout holds', () => {
    engine.setRoutes([
      notes({
        destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
      }),
    ]);
    transport.inject('mock-circuit-in', [0x90, 55, 100]);
    expect(transport.getSent()).toHaveLength(2);
    transport.clearSent();
    engine.allNotesOff();
    const offs = transport.getSent();
    expect(offs).toHaveLength(2);
    expect(new Set(offs.map((s) => s.portId))).toEqual(
      new Set(['mock-mpc-out', 'mock-sp404-out']),
    );
  });

  it('unexpected Program Change remaps channel and does not hang notes', () => {
    engine.setRoutes([notes()]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    transport.clearSent();
    transport.inject('mock-circuit-in', [0xc0, 7]); // PC 7 ch1
    expect(Array.from(transport.getSent()[0]!.data)).toEqual([0xc8, 7]); // ch9
    transport.clearSent();
    // Note still tracked — panic releases it
    engine.allNotesOff();
    expect(transport.getSent()[0]!.data[1]).toBe(60);
  });

  it('unexpected PC can be blocked without affecting Note On/Off', () => {
    engine.setRoutes([notes({ blockKinds: ['program-change'] })]);
    transport.inject('mock-circuit-in', [0xc0, 3]);
    expect(transport.getSent()).toHaveLength(0);
    transport.inject('mock-circuit-in', [0x90, 41, 90]);
    transport.inject('mock-circuit-in', [0x80, 41, 0]);
    expect(transport.getSent()).toHaveLength(2);
  });

  it('reconnect during transport: clock resumes; new notes after re-enable', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([notes(), clock()]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0x90, 60, 100]);
    transport.clearSent();

    // Dest drops mid-transport
    engine.releaseNotesForPort('mock-mpc-out');
    transport.setPortConnected('mock-mpc-out', false);
    transport.clearSent();
    transport.inject('mock-circuit-in', [0xf8]);
    // SP still gets clock; MPC dropped
    expect(transport.getSent().some((s) => s.portId === 'mock-sp404-out' && s.data[0] === 0xf8)).toBe(
      true,
    );
    expect(transport.getSent().every((s) => s.portId !== 'mock-mpc-out')).toBe(true);

    transport.clearSent();
    transport.setPortConnected('mock-mpc-out', true);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0x90, 61, 100]);
    expect(transport.getSent().some((s) => s.portId === 'mock-mpc-out' && s.data[0] === 0xf8)).toBe(
      true,
    );
    expect(
      transport.getSent().some(
        (s) => s.portId === 'mock-mpc-out' && (s.data[0]! & 0xf0) === 0x90 && s.data[1] === 61,
      ),
    ).toBe(true);
  });

  it('default note route keeps forwardClock false (no accidental clock thru)', () => {
    engine.setRoutes([notes()]); // forwardClock: false
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfc]);
    expect(transport.getSent()).toHaveLength(0);
  });
});
