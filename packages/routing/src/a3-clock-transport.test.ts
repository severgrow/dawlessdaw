import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { ClockHealthMonitor, MusicalPositionModel, PPQN } from '@dawlessdaw/sequencer';
import { MidiRoutingEngine } from './engine';
import type { MidiRoute } from './types';
import { buildMyStudioRoutes } from '@dawlessdaw/devices';

/**
 * A3 — Stable clock / transport (deterministic Vitest).
 * Start/Stop/Continue, clock loss/reconnect, authority, no accidental
 * duplicate clock, injected BPM. App clock forwarding stays off by default.
 */
describe('A3 clock / transport', () => {
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

  const clockRoute = (overrides: Partial<MidiRoute> = {}): MidiRoute => ({
    id: 'clock',
    name: 'clock',
    enabled: true,
    sourcePortId: 'mock-circuit-in',
    destinations: [{ portId: 'mock-mpc-out' }, { portId: 'mock-sp404-out' }],
    forwardClock: true,
    blockKinds: ['note-on', 'note-off', 'cc', 'program-change'],
    ...overrides,
  });

  /** Inject F8s at a steady BPM using a controllable ClockHealth / Position now(). */
  function injectClocks(
    count: number,
    bpm: number,
    onTick: (i: number) => void,
    advance: (ms: number) => void,
  ): void {
    const ms = 60_000 / (bpm * PPQN);
    for (let i = 0; i < count; i++) {
      advance(ms);
      onTick(i);
    }
  }

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  afterEach(() => {
    vi.useRealTimers();
    engine.stop();
  });

  // ── Defaults / no accidental app clock ───────────────────────────

  it('studio note routes keep app clock forwarding off by default', () => {
    const routes = buildMyStudioRoutes({
      circuitIn: 'mock-circuit-in',
      mpcOut: 'mock-mpc-out',
      spOut: 'mock-sp404-out',
      fm1Out: 'mock-fm1-out',
      // clockToMpc / clockToSp / forwardClockToFm1 omitted → false
    });
    expect(routes.some((r) => r.forwardClock === true)).toBe(false);
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes(routes);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfb]);
    transport.inject('mock-circuit-in', [0xfc]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('omitting forwardClock does not forward clock (opt-in only)', () => {
    engine.setRoutes([
      {
        id: 'open',
        name: 'no forwardClock field',
        enabled: true,
        sourcePortId: 'mock-circuit-in',
        destinations: [{ portId: 'mock-mpc-out' }],
      },
    ]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(transport.getSent()).toHaveLength(0);
  });

  it('opt-in clockToMpc only adds one clock route — no duplicate F8 to MPC', () => {
    const routes = buildMyStudioRoutes({
      circuitIn: 'mock-circuit-in',
      mpcOut: 'mock-mpc-out',
      spOut: 'mock-sp404-out',
      fm1Out: 'mock-fm1-out',
      clockToMpc: true,
    });
    const clockRoutes = routes.filter((r) => r.forwardClock === true);
    expect(clockRoutes).toHaveLength(1);
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes(routes);
    transport.inject('mock-circuit-in', [0xf8]);
    const toMpc = transport.getSent().filter((s) => s.portId === 'mock-mpc-out' && s.data[0] === 0xf8);
    expect(toMpc).toHaveLength(1);
  });

  // ── Start / Stop / Continue ──────────────────────────────────────

  it('forwards Start / Continue / Stop / Clock once per dest when opted in', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([notes(), clockRoute()]);
    for (const status of [0xfa, 0xfb, 0xf8, 0xfc] as const) {
      transport.inject('mock-circuit-in', [status]);
    }
    const mpc = transport.getSent().filter((s) => s.portId === 'mock-mpc-out').map((s) => s.data[0]);
    const sp = transport.getSent().filter((s) => s.portId === 'mock-sp404-out').map((s) => s.data[0]);
    expect(mpc).toEqual([0xfa, 0xfb, 0xf8, 0xfc]);
    expect(sp).toEqual([0xfa, 0xfb, 0xf8, 0xfc]);
  });

  it('musical position: Start resets; Continue resumes; Stop freezes; clocks ignored when stopped', () => {
    let t = 0;
    const pos = new MusicalPositionModel({ now: () => t });
    pos.onStart();
    for (let i = 0; i < PPQN; i++) {
      t += 10;
      pos.onClock();
    }
    expect(pos.getSnapshot().transport).toBe('playing');
    expect(pos.getSnapshot().beat).toBe(2);

    pos.onStop();
    const ticksAtStop = pos.getSnapshot().tickCount;
    t += 10;
    pos.onClock(); // ignored while stopped
    expect(pos.getSnapshot().transport).toBe('stopped');
    expect(pos.getSnapshot().tickCount).toBe(ticksAtStop);

    pos.onContinue();
    expect(pos.getSnapshot().transport).toBe('playing');
    expect(pos.getSnapshot().tickCount).toBe(ticksAtStop);
    t += 10;
    pos.onClock();
    expect(pos.getSnapshot().tickCount).toBe(ticksAtStop + 1);

    pos.onStart();
    expect(pos.getSnapshot().tickCount).toBe(0);
    expect(pos.getSnapshot().bar).toBe(1); // bar 1 at Start, before first clock
    expect(pos.getSnapshot().beat).toBe(1);
  });

  it('Clock Health tracks Start / Continue / Stop + restart count', () => {
    let t = 0;
    const health = new ClockHealthMonitor({ now: () => t });
    health.onStart('mock-circuit-in');
    expect(health.getSnapshot().restartCount).toBe(1);
    t += 20;
    health.onClock('mock-circuit-in');
    health.onStop('mock-circuit-in');
    health.onContinue('mock-circuit-in');
    expect(health.getSnapshot().restartCount).toBe(1); // Continue is not a restart
    health.onStop();
    health.onStart('mock-circuit-in');
    expect(health.getSnapshot().restartCount).toBe(2);
  });

  // ── Authority / no duplicate leaders ─────────────────────────────

  it('non-authority Start/Clock/Continue never forward', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      notes(),
      clockRoute(),
      clockRoute({
        id: 'rogue',
        sourcePortId: 'mock-mpc-in',
        destinations: [{ portId: 'mock-sp404-out' }],
      }),
    ]);
    transport.inject('mock-mpc-in', [0xfa]);
    transport.inject('mock-mpc-in', [0xf8]);
    transport.inject('mock-mpc-in', [0xfb]);
    expect(transport.getSent()).toHaveLength(0);
    transport.inject('mock-circuit-in', [0xfa]);
    expect(transport.getSent().map((s) => s.data[0])).toEqual([0xfa, 0xfa]); // two dests
  });

  it('two clock routes to the same dest would double — prefer a single clock route', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([
      clockRoute({ id: 'clock-a', destinations: [{ portId: 'mock-mpc-out' }] }),
      clockRoute({ id: 'clock-b', destinations: [{ portId: 'mock-mpc-out' }] }),
    ]);
    transport.inject('mock-circuit-in', [0xf8]);
    // Documents current engine behaviour: each matching route fires.
    // Studio builders must emit only one clock route per dest (asserted above).
    expect(
      transport.getSent().filter((s) => s.portId === 'mock-mpc-out' && s.data[0] === 0xf8),
    ).toHaveLength(2);
  });

  // ── Injected deterministic clock + loss / reconnect ──────────────

  it('injected 120 BPM clock yields ≈120 on Clock Health and musical position', () => {
    let t = 0;
    const health = new ClockHealthMonitor({ now: () => t });
    const pos = new MusicalPositionModel({ now: () => t });
    health.onStart('mock-circuit-in');
    pos.onStart();

    injectClocks(
      48,
      120,
      () => {
        health.onClock('mock-circuit-in');
        pos.onClock();
      },
      (ms) => {
        t += ms;
      },
    );

    const h = health.getSnapshot();
    expect(h.status).toBe('STABLE');
    expect(h.bpm!).toBeGreaterThan(118);
    expect(h.bpm!).toBeLessThan(122);
    expect(pos.getSnapshot().bpm!).toBeGreaterThan(118);
    expect(pos.getSnapshot().bpm!).toBeLessThan(122);
    health.setPosition({
      transport: pos.getSnapshot().transport,
      bar: pos.getSnapshot().bar,
      beat: pos.getSnapshot().beat,
      bpm: pos.getSnapshot().bpm,
    });
    expect(health.getSnapshot().position?.bar).toBe(pos.getSnapshot().bar);
  });

  it('clock loss then reconnect: CLOCK LOST → measuring → STABLE again', () => {
    vi.useFakeTimers();
    let t = 0;
    const health = new ClockHealthMonitor({ now: () => t });
    health.onStart('mock-circuit-in');
    injectClocks(
      36,
      128,
      () => health.onClock('mock-circuit-in'),
      (ms) => {
        t += ms;
      },
    );
    expect(health.getSnapshot().clockDetected).toBe(true);
    expect(health.getSnapshot().bpm!).toBeGreaterThan(120);

    t += 500;
    vi.advanceTimersByTime(500);
    expect(health.getSnapshot().status).toBe('CLOCK LOST');
    expect(health.getSnapshot().clockDetected).toBe(false);

    // Reconnect: Circuit Stop then Start (or loss timer marked stopped) then clocks
    health.onStop('mock-circuit-in');
    health.onStart('mock-circuit-in');
    injectClocks(
      40,
      128,
      () => health.onClock('mock-circuit-in'),
      (ms) => {
        t += ms;
      },
    );
    expect(health.getSnapshot().status).toBe('STABLE');
    expect(health.getSnapshot().clockDetected).toBe(true);
    expect(health.getSnapshot().restartCount).toBeGreaterThanOrEqual(2);
  });

  it('routing survives dest disconnect/reconnect while clock is forwarded', () => {
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([notes(), clockRoute()]);
    transport.inject('mock-circuit-in', [0xfa]);
    transport.clearSent();

    transport.setPortConnected('mock-mpc-out', false);
    transport.inject('mock-circuit-in', [0xf8]);
    expect(transport.getSent().every((s) => s.portId === 'mock-sp404-out')).toBe(true);
    expect(transport.getSent().some((s) => s.data[0] === 0xf8)).toBe(true);

    transport.clearSent();
    transport.setPortConnected('mock-mpc-out', true);
    transport.inject('mock-circuit-in', [0xf8]);
    transport.inject('mock-circuit-in', [0xfb]); // Continue
    expect(transport.getSent().some((s) => s.portId === 'mock-mpc-out' && s.data[0] === 0xf8)).toBe(
      true,
    );
    expect(transport.getSent().some((s) => s.portId === 'mock-mpc-out' && s.data[0] === 0xfb)).toBe(
      true,
    );
  });

  it('duplicate-source hint when foreign port also clocks (authority still sole forwarder)', () => {
    let t = 0;
    const health = new ClockHealthMonitor({ now: () => t });
    engine.setClockAuthority('mock-circuit-in');
    engine.setRoutes([clockRoute()]);

    health.onStart('mock-circuit-in');
    for (let i = 0; i < 30; i++) {
      t += 20;
      health.onClock('mock-circuit-in');
      transport.inject('mock-circuit-in', [0xf8]);
      // Foreign input — health hint only; must not forward
      health.observeOtherClockPort('mock-mpc-in');
      transport.inject('mock-mpc-in', [0xf8]);
    }
    expect(health.getSnapshot().possibleDuplicateSources).toBe(true);
    expect(
      transport.getSent().every((s) => s.portId === 'mock-mpc-out' || s.portId === 'mock-sp404-out'),
    ).toBe(true);
  });
});
