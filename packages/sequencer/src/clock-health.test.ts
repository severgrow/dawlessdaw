import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockHealthMonitor } from './clock-health';
import { PPQN } from './scheduler';

describe('ClockHealthMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts UNKNOWN with no clock', () => {
    const m = new ClockHealthMonitor({ now: () => 0 });
    expect(m.getSnapshot().status).toBe('UNKNOWN');
    expect(m.getSnapshot().clockDetected).toBe(false);
  });

  it('measures BPM and reaches STABLE on steady clock', () => {
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    m.onStart('circuit');
    // 120 BPM → 24 PPQN → 20.833 ms per clock
    const ms = 60_000 / (120 * PPQN);
    for (let i = 0; i < 48; i++) {
      t += ms;
      m.onClock('circuit');
    }
    const snap = m.getSnapshot();
    expect(snap.clockDetected).toBe(true);
    expect(snap.bpm).toBeGreaterThan(118);
    expect(snap.bpm).toBeLessThan(122);
    expect(snap.status).toBe('STABLE');
    expect(snap.jitterMs).not.toBeNull();
    expect(snap.jitterMs!).toBeLessThan(1);
  });

  it('reads MIDI timestamps when clock callbacks arrive in bursts', () => {
    vi.useFakeTimers();
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    const interval = 60_000 / (94 * PPQN);
    for (let i = 0; i < 96; i++) {
      // Six ticks can arrive together after the main thread catches up.
      t = Math.ceil((i + 1) / 6) * 6 * interval;
      m.onMidiTransport('clock', 'circuit', i * interval);
    }
    expect(m.getSnapshot()).toMatchObject({
      bpm: 94,
      status: 'STABLE',
      lastClockPortId: 'circuit',
      clockDetected: true,
    });
    m.onMidiTransport('stop', 'circuit');
    t += 500;
    vi.advanceTimersByTime(500);
    expect(m.getSnapshot().status).toBe('CLOCK LOST');
  });

  it('flags VARIABLE when intervals jitter heavily', () => {
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    m.onStart('circuit');
    const base = 60_000 / (120 * PPQN);
    for (let i = 0; i < 48; i++) {
      t += i % 2 === 0 ? base * 0.5 : base * 1.8;
      m.onClock('circuit');
    }
    expect(m.getSnapshot().status).toBe('VARIABLE');
    expect(m.getSnapshot().jitterMs!).toBeGreaterThan(2);
  });

  it('counts gaps and restarts', () => {
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    m.onStart('a');
    const ms = 20;
    for (let i = 0; i < 30; i++) {
      t += ms;
      m.onClock('a');
    }
    t += ms * 10; // gap
    m.onClock('a');
    expect(m.getSnapshot().gapCount).toBeGreaterThanOrEqual(1);
    m.onStop();
    m.onStart('a');
    expect(m.getSnapshot().restartCount).toBe(2);
  });

  it('hints possible duplicate sources from multiple ports', () => {
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    m.onStart('in-a');
    for (let i = 0; i < 30; i++) {
      t += 20;
      m.onClock(i % 2 === 0 ? 'in-a' : 'in-b');
    }
    expect(m.getSnapshot().possibleDuplicateSources).toBe(true);
    expect(m.getSnapshot().recentClockPorts.length).toBe(2);
  });

  it('reports CLOCK LOST after silence', () => {
    vi.useFakeTimers();
    let t = 0;
    const m = new ClockHealthMonitor({ now: () => t });
    m.onStart('circuit');
    for (let i = 0; i < 30; i++) {
      t += 20;
      m.onClock('circuit');
    }
    expect(m.getSnapshot().clockDetected).toBe(true);
    t += 500;
    vi.advanceTimersByTime(500);
    expect(m.getSnapshot().status).toBe('CLOCK LOST');
    expect(m.getSnapshot().clockDetected).toBe(false);
  });

  it('accepts musical position from M1', () => {
    const m = new ClockHealthMonitor({ now: () => 1 });
    m.setPosition({ transport: 'playing', bar: 2, beat: 3, bpm: 120 });
    expect(m.getSnapshot().position).toEqual({
      transport: 'playing',
      bar: 2,
      beat: 3,
      bpm: 120,
    });
  });

  it('getSnapshot is stable until mutation', () => {
    const m = new ClockHealthMonitor({ now: () => 1 });
    const a = m.getSnapshot();
    expect(m.getSnapshot()).toBe(a);
    m.onClock('x');
    expect(m.getSnapshot()).not.toBe(a);
  });
});
