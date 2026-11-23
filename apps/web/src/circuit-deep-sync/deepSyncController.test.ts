import { describe, expect, it } from 'vitest';
import { DeepSyncController } from './deepSyncController';

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
