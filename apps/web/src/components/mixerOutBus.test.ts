import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMixerOutLevels,
  getMixerOutLevels,
  loadRigBackdropDrawings,
  loadRigBackdropEnabled,
  publishMixerOutLevels,
  RIG_BACKDROP_DRAWINGS_KEY,
  RIG_BACKDROP_KEY,
  saveRigBackdropDrawings,
  saveRigBackdropEnabled,
  subscribeMixerOutLevels,
} from './mixerOutBus';

afterEach(() => {
  clearMixerOutLevels();
  try {
    localStorage.removeItem(RIG_BACKDROP_KEY);
    localStorage.removeItem(RIG_BACKDROP_DRAWINGS_KEY);
  } catch {
    // ignore
  }
});

function memStorage() {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  };
}

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
    const storage = memStorage();
    expect(loadRigBackdropEnabled(true, storage)).toBe(true);
    saveRigBackdropEnabled(false, storage);
    expect(loadRigBackdropEnabled(true, storage)).toBe(false);
    saveRigBackdropEnabled(true, storage);
    expect(loadRigBackdropEnabled(true, storage)).toBe(true);
  });

  it('defaults equipment drawings off and persists independently', () => {
    const storage = memStorage();
    expect(loadRigBackdropDrawings(false, storage)).toBe(false);
    saveRigBackdropDrawings(true, storage);
    expect(loadRigBackdropDrawings(false, storage)).toBe(true);
    saveRigBackdropEnabled(false, storage);
    // Drawings pref stays even if Motion is off
    expect(loadRigBackdropDrawings(false, storage)).toBe(true);
    saveRigBackdropDrawings(false, storage);
    expect(loadRigBackdropDrawings(false, storage)).toBe(false);
  });
});
