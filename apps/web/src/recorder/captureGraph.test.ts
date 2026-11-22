import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MONITOR_INPUT_DEFAULT,
  RECORDER_MONITOR_KEY,
  loadPersistedMonitorInput,
  persistMonitorInput,
  planCaptureGraph,
} from './captureGraph';

describe('planCaptureGraph', () => {
  it('defaults monitor off and never routes source to destination', () => {
    expect(MONITOR_INPUT_DEFAULT).toBe(false);
    const plan = planCaptureGraph(MONITOR_INPUT_DEFAULT);
    expect(plan.sourceToWorklet).toBe(true);
    expect(plan.workletToSilentDestination).toBe(true);
    expect(plan.sourceToDestination).toBe(false);
    expect(plan.monitorDefaultOn).toBe(false);
  });

  it('only allows source→destination when monitor is explicitly on', () => {
    expect(planCaptureGraph(false).sourceToDestination).toBe(false);
    expect(planCaptureGraph(true).sourceToDestination).toBe(true);
  });
});

describe('persist monitor preference', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('loads default off when unset', () => {
    expect(loadPersistedMonitorInput()).toBe(false);
  });

  it('round-trips on/off', () => {
    persistMonitorInput(true);
    expect(mem.get(RECORDER_MONITOR_KEY)).toBe('1');
    expect(loadPersistedMonitorInput()).toBe(true);
    persistMonitorInput(false);
    expect(mem.get(RECORDER_MONITOR_KEY)).toBe('0');
    expect(loadPersistedMonitorInput()).toBe(false);
  });
});
