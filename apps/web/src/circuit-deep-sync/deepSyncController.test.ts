import { describe, expect, it } from 'vitest';
import { DeepSyncController } from './deepSyncController';

/**
 * useSyncExternalStore requires a stable getSnapshot reference between notifies.
 * Audit (Phase 0): DeepSyncController is the only store wired via useSyncExternalStore.
 * StudioRuntime → Zustand hydrate-on-notify; Flip/capture → subscribe + setState.
 * Those patterns are safe without snapshot caching.
 */
describe('DeepSyncController getSnapshot caching', () => {
  it('returns the same object reference until emit', () => {
    const ctrl = new DeepSyncController();
    const a = ctrl.getSnapshot();
    const b = ctrl.getSnapshot();
    expect(a).toBe(b);
    expect(a.enabled).toBe(false);
  });

  it('replaces the snapshot after a status-changing emit', () => {
    const ctrl = new DeepSyncController();
    const before = ctrl.getSnapshot();
    ctrl.clearLogs(); // emits without needing Web MIDI / .ncs bytes
    const after = ctrl.getSnapshot();
    expect(after).not.toBe(before);
    expect(ctrl.getSnapshot()).toBe(after);
  });
});
