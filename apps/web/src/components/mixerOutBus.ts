/**
 * Live mixer-out levels for the Rig backdrop. AudioPreview publishes;
 * RigMixerBackdrop subscribes. No MIDI / routing side effects.
 */

export interface MixerOutLevels {
  /** Peak 0…1 left / right */
  l: number;
  r: number;
  /** Combined energy 0…1 (RMS-ish) */
  energy: number;
  running: boolean;
}

type Listener = (levels: MixerOutLevels) => void;

const IDLE: MixerOutLevels = { l: 0, r: 0, energy: 0, running: false };

let current: MixerOutLevels = IDLE;
const listeners = new Set<Listener>();

export function getMixerOutLevels(): MixerOutLevels {
  return current;
}

export function publishMixerOutLevels(next: MixerOutLevels): void {
  current = next;
  for (const fn of listeners) fn(next);
}

export function subscribeMixerOutLevels(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

/** Clear to idle (e.g. Stop). */
export function clearMixerOutLevels(): void {
  publishMixerOutLevels(IDLE);
}

export const RIG_BACKDROP_KEY = 'dawlessdaw.rigMixerBackdrop';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadRigBackdropEnabled(fallback = true, storage: StorageLike | null = browserStorage()): boolean {
  try {
    const raw = storage?.getItem(RIG_BACKDROP_KEY) ?? null;
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

export function saveRigBackdropEnabled(on: boolean, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(RIG_BACKDROP_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable
  }
}
