/**
 * Shared ClockService seam — adapters + injected clock for tests.
 * Must never claim app clock forwarding.
 */

import { describe, expect, it } from 'vitest';
import {
  adaptClockService,
  captureHintFromClockService,
  createInjectedClockService,
} from './clock-service';
import { ClockHealthMonitor } from './clock-health';
import { MusicalPositionModel } from './musical-position';

describe('ClockService', () => {
  it('injected clock never enables app clock forwarding', () => {
    const svc = createInjectedClockService();
    expect(svc.appClockForwarding).toBe(false);
    svc.injectStableClock({ bpm: 120, tickCount: 96 });
    expect(svc.appClockForwarding).toBe(false);
    expect(svc.getQuality()?.confidence).toBe('High');
    expect(svc.getMusicalTime()?.tickCount).toBe(96);
  });

  it('injectTime advances now() for deterministic tests', () => {
    const svc = createInjectedClockService({ nowMs: 1000 });
    expect(svc.now()).toBe(1000);
    svc.injectTime(2500);
    expect(svc.now()).toBe(2500);
  });

  it('adaptClockService mirrors position + health without rewrite', () => {
    let t = 0;
    const pos = new MusicalPositionModel({ now: () => t });
    const health = new ClockHealthMonitor({ now: () => t });
    const svc = adaptClockService({
      now: () => t,
      getMusicalTime: () => pos.getSnapshot(),
      getHealthSnapshot: () => health.getSnapshot(),
      subscribe: (fn) => {
        const a = pos.subscribe(fn);
        const b = health.subscribe(fn);
        return () => {
          a();
          b();
        };
      },
    });

    expect(svc.appClockForwarding).toBe(false);
    pos.onStart();
    health.onStart('circuit-in');
    for (let i = 0; i < 48; i++) {
      t += 20.833; // ~120 BPM @ 24 PPQN
      pos.onClock();
      health.onClock('circuit-in');
    }
    health.setPosition({
      transport: pos.getSnapshot().transport,
      bar: pos.getSnapshot().bar,
      beat: pos.getSnapshot().beat,
      bpm: pos.getSnapshot().bpm,
    });

    const mt = svc.getMusicalTime();
    expect(mt?.transport).toBe('playing');
    expect(mt?.tickCount).toBe(48);
    expect(svc.getHealthSnapshot()?.bpm).toBeTruthy();
    expect(svc.getQuality()?.clockDetected).toBe(true);
  });

  it('captureHintFromClockService carries position for bar-align', () => {
    const svc = createInjectedClockService();
    svc.injectStableClock({ bpm: 128, tickCount: 192, bar: 3, beat: 1 });
    const hint = captureHintFromClockService(svc);
    expect(hint.confidence).toBe('High');
    expect(hint.bpm).toBe(128);
    expect(hint.position?.tickCount).toBe(192);
    expect(hint.clockDetected).toBe(true);
  });

  it('subscribe notifies on injected set', () => {
    const svc = createInjectedClockService();
    let n = 0;
    const unsub = svc.subscribe(() => {
      n += 1;
    });
    svc.set({ nowMs: 10 });
    svc.injectStableClock({ bpm: 100, tickCount: 0 });
    unsub();
    svc.set({ nowMs: 20 });
    expect(n).toBe(2);
  });
});
