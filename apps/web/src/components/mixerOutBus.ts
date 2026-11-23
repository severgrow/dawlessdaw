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
/** Large DeviceArt silhouettes behind the Rig map (separate from Motion wash/bars). */
export const RIG_BACKDROP_DRAWINGS_KEY = 'dawlessdaw.rigMixerBackdropDrawings';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function loadFlag(
  key: string,
  fallback: boolean,
  storage: StorageLike | null,
): boolean {
  try {
    const raw = storage?.getItem(key) ?? null;
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, on: boolean, storage: StorageLike | null): void {
  try {
    storage?.setItem(key, on ? '1' : '0');
  } catch {
    // storage unavailable
  }
}

export function loadRigBackdropEnabled(fallback = true, storage: StorageLike | null = browserStorage()): boolean {
  return loadFlag(RIG_BACKDROP_KEY, fallback, storage);
}

export function saveRigBackdropEnabled(on: boolean, storage: StorageLike | null = browserStorage()): void {
  saveFlag(RIG_BACKDROP_KEY, on, storage);
}

/**
 * Equipment silhouette drawings behind the map.
 * Default **off** (cleaner). Independent of Motion wash/bars.
 */
export function loadRigBackdropDrawings(
  fallback = false,
  storage: StorageLike | null = browserStorage(),
): boolean {
  return loadFlag(RIG_BACKDROP_DRAWINGS_KEY, fallback, storage);
}

export function saveRigBackdropDrawings(on: boolean, storage: StorageLike | null = browserStorage()): void {
  saveFlag(RIG_BACKDROP_DRAWINGS_KEY, on, storage);
}
