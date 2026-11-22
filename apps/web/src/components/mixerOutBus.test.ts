import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMixerOutLevels,
  getMixerOutLevels,
  loadRigBackdropEnabled,
  publishMixerOutLevels,
  RIG_BACKDROP_KEY,
  saveRigBackdropEnabled,
  subscribeMixerOutLevels,
} from './mixerOutBus';

afterEach(() => {
  clearMixerOutLevels();
  try {
    localStorage.removeItem(RIG_BACKDROP_KEY);
  } catch {
    // ignore
  }
});

describe('mixerOutBus', () => {
  it('publishes levels to subscribers', () => {
    const seen: number[] = [];
    const unsub = subscribeMixerOutLevels((l) => seen.push(l.energy));
    publishMixerOutLevels({ l: 0.5, r: 0.4, energy: 0.45, running: true });
    expect(getMixerOutLevels().running).toBe(true);
    expect(seen.at(-1)).toBe(0.45);
    clearMixerOutLevels();
    expect(getMixerOutLevels().running).toBe(false);
    unsub();
  });

  it('persists backdrop toggle', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    expect(loadRigBackdropEnabled(true, storage)).toBe(true);
    saveRigBackdropEnabled(false, storage);
    expect(loadRigBackdropEnabled(true, storage)).toBe(false);
    saveRigBackdropEnabled(true, storage);
    expect(loadRigBackdropEnabled(true, storage)).toBe(true);
  });
});
