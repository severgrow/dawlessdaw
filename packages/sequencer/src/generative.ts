/**
 * Generative pattern workspace (Circuit P1).
 *
 * Keeps an immutable **source** (from Live observation / .ncs / Pattern)
 * separate from the editable **working** variation.
 * Locks protect steps across Generate / Mutate. Undo restores working only.
 */

import {
  SeededRng,
  quantizePitch,
  scalePitches,
  type ScaleId,
} from './scale';
import { clonePattern, createPattern } from './pattern';
import {
  SEQ_STEP_COUNT,
  SEQ_TRACK_COUNT,
  type SeqPattern,
  type SeqStep,
} from './types';

export type GenerativeSourceKind = 'none' | 'mirror' | 'capture' | 'ncs' | 'pattern' | 'blank';

export interface GenerativeSettings {
  /** Pitch class 0–11 */
  root: number;
  scaleId: ScaleId;
  /** 0–1 probability a unlocked step is on when generating */
  density: number;
  /** 0–1 mutation strength (pitch / on-off / velocity) */
  mutation: number;
  /** Seeded RNG seed (uint32) */
  seed: number;
}

export type LockGrid = boolean[][];

export interface GenerativeSnapshot {
  honesty: 'experimental';
  source: SeqPattern | null;
  working: SeqPattern;
  locks: LockGrid;
  settings: GenerativeSettings;
  sourceKind: GenerativeSourceKind;
  undoCount: number;
  hasSource: boolean;
}

export type GenerativeListener = () => void;

export const DEFAULT_GENERATIVE_SETTINGS: GenerativeSettings = {
  root: 9, // A
  scaleId: 'minor',
  density: 0.35,
  mutation: 0.4,
  seed: 1,
};

function emptyLocks(): LockGrid {
  return Array.from({ length: SEQ_TRACK_COUNT }, () =>
    Array.from({ length: SEQ_STEP_COUNT }, () => false),
  );
}

function cloneLocks(locks: LockGrid): LockGrid {
  return locks.map((row) => row.slice());
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampRoot(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % 12) + 12) % 12;
}

function velocityFromRng(rng: SeededRng): number {
  return 70 + rng.nextInt(48); // 70–117
}

function makeStep(on: boolean, pitch: number, velocity: number, gate = 0.85): SeqStep {
  return {
    on,
    pitch: Math.max(0, Math.min(127, pitch)),
    velocity: Math.max(1, Math.min(127, velocity)),
    gate,
  };
}

/**
 * Fill unlocked steps from settings (density + scale + seed).
 * Locked steps are copied unchanged from `base`.
 */
export function generateWorkingPattern(
  base: SeqPattern,
  locks: LockGrid,
  settings: GenerativeSettings,
): SeqPattern {
  const rng = new SeededRng(settings.seed >>> 0);
  const next = clonePattern(base);
  const pitches = scalePitches(settings.root, settings.scaleId, 36, 84);
  const density = clamp01(settings.density);

  for (let t = 0; t < SEQ_TRACK_COUNT; t++) {
    const track = next.tracks[t]!;
    const pool = pitches.length
      ? pitches
      : [quantizePitch(track.defaultPitch, settings.root, settings.scaleId)];
    for (let s = 0; s < SEQ_STEP_COUNT; s++) {
      if (locks[t]?.[s]) continue;
      if (s >= next.length) {
        track.steps[s] = makeStep(false, track.defaultPitch, track.defaultVelocity);
        continue;
      }
      const on = rng.chance(density);
      const pitch = rng.pick(pool);
      track.steps[s] = makeStep(on, pitch, on ? velocityFromRng(rng) : track.defaultVelocity);
    }
  }
  return next;
}

/**
 * Mutate unlocked steps of `working` toward a new variation.
 * Source is never modified. Locked steps stay put.
 */
export function mutateWorkingPattern(
  working: SeqPattern,
  locks: LockGrid,
  settings: GenerativeSettings,
  /** Extra entropy so Mutate ≠ Generate with same seed */
  salt = 0x51ed,
  activeTracks?: readonly boolean[],
): SeqPattern {
  const rng = new SeededRng((settings.seed ^ salt) >>> 0);
  const next = clonePattern(working);
  const pitches = scalePitches(settings.root, settings.scaleId, 36, 84);
  const amount = clamp01(settings.mutation);

  for (let t = 0; t < SEQ_TRACK_COUNT; t++) {
    if (activeTracks && !activeTracks[t]) continue;
    const track = next.tracks[t]!;
    const pool = pitches.length
      ? pitches
      : [quantizePitch(track.defaultPitch, settings.root, settings.scaleId)];
    for (let s = 0; s < next.length; s++) {
      if (locks[t]?.[s]) continue;
      const cur = track.steps[s]!;
      // Chance to touch this step scales with mutation amount.
      if (!rng.chance(amount)) {
        // Still quantize pitch if on, so scale changes apply gently.
        if (cur.on) {
          track.steps[s] = makeStep(
            true,
            quantizePitch(cur.pitch, settings.root, settings.scaleId),
            cur.velocity,
            cur.gate,
          );
        }
        continue;
      }
      const roll = rng.next();
      if (roll < 0.35) {
        // Flip on/off
        const on = !cur.on;
        track.steps[s] = makeStep(
          on,
          on ? rng.pick(pool) : cur.pitch,
          on ? velocityFromRng(rng) : cur.velocity,
          cur.gate,
        );
      } else if (roll < 0.75) {
        // Repitch within scale
        track.steps[s] = makeStep(cur.on || rng.chance(0.5), rng.pick(pool), velocityFromRng(rng), cur.gate);
      } else {
        // Velocity nudge / ensure on
        track.steps[s] = makeStep(true, quantizePitch(cur.pitch, settings.root, settings.scaleId), velocityFromRng(rng), cur.gate);
      }
    }
  }
  return next;
}

export class GenerativeEngine {
  private source: SeqPattern | null = null;
  private working: SeqPattern;
  private locks: LockGrid = emptyLocks();
  private settings: GenerativeSettings = { ...DEFAULT_GENERATIVE_SETTINGS };
  private sourceKind: GenerativeSourceKind = 'none';
  private undoStack: SeqPattern[] = [];
  private mutationCount = 0;
  private listeners = new Set<GenerativeListener>();
  private cached: GenerativeSnapshot | null = null;

  constructor(opts?: { pattern?: SeqPattern; settings?: Partial<GenerativeSettings> }) {
    this.working = clonePattern(opts?.pattern ?? createPattern(1));
    if (opts?.settings) this.settings = { ...this.settings, ...sanitizeSettings(opts.settings) };
  }

  subscribe(fn: GenerativeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): GenerativeSnapshot {
    if (!this.cached) {
      this.cached = {
        honesty: 'experimental',
        source: this.source ? clonePattern(this.source) : null,
        working: clonePattern(this.working),
        locks: cloneLocks(this.locks),
        settings: { ...this.settings },
        sourceKind: this.sourceKind,
        undoCount: this.undoStack.length,
        hasSource: this.source != null,
      };
    }
    return this.cached;
  }

  setSettings(patch: Partial<GenerativeSettings>): void {
    const next = sanitizeSettings({ ...this.settings, ...patch });
    if (next.root === this.settings.root && next.scaleId === this.settings.scaleId &&
        next.density === this.settings.density && next.mutation === this.settings.mutation &&
        next.seed === this.settings.seed) return;
    this.settings = next;
    this.emit();
  }

  /**
   * Capture a source pattern. Working starts as a clone of source.
   * Clears locks + undo (new baseline).
   */
  captureSource(pattern: SeqPattern, kind: GenerativeSourceKind): void {
    this.source = clonePattern(pattern);
    this.working = clonePattern(pattern);
    this.sourceKind = kind;
    this.locks = emptyLocks();
    this.undoStack = [];
    this.mutationCount = 0;
    this.emit();
  }

  /** Push current working onto undo, then apply next. */
  private commit(next: SeqPattern): void {
    this.undoStack.push(clonePattern(this.working));
    if (this.undoStack.length > 64) this.undoStack.shift();
    this.working = clonePattern(next);
    this.emit();
  }

  /** Generate a fresh variation into working (unlocked steps). Keeps source. */
  generate(): void {
    this.commit(generateWorkingPattern(this.working, this.locks, this.settings));
  }

  /** Mutate working; source unchanged. */
  mutate(): void {
    const activeTracks = this.sourceKind === 'capture'
      ? this.working.tracks.map((track, index) =>
          track.steps.slice(0, this.working.length).some((step) => step.on) ||
          this.source?.tracks[index]?.steps.some((step) => step.on) === true,
        )
      : undefined;
    this.commit(mutateWorkingPattern(
      this.working, this.locks, this.settings, 0x51ed + this.mutationCount++, activeTracks,
    ));
  }

  /** Restore working from source (or empty). Respects locks — locked steps stay. */
  resetToSource(): void {
    if (!this.source) return;
    const next = clonePattern(this.source);
    // Preserve locked cells from current working.
    for (let t = 0; t < SEQ_TRACK_COUNT; t++) {
      for (let s = 0; s < SEQ_STEP_COUNT; s++) {
        if (this.locks[t]?.[s]) {
          next.tracks[t]!.steps[s] = { ...this.working.tracks[t]!.steps[s]! };
        }
      }
    }
    this.commit(next);
  }

  setLock(track: number, step: number, locked: boolean): void {
    const t = track - 1;
    if (t < 0 || t >= SEQ_TRACK_COUNT) return;
    if (step < 0 || step >= SEQ_STEP_COUNT) return;
    this.locks[t]![step] = locked;
    this.emit();
  }

  toggleLock(track: number, step: number): void {
    const t = track - 1;
    if (t < 0 || t >= SEQ_TRACK_COUNT) return;
    if (step < 0 || step >= SEQ_STEP_COUNT) return;
    this.locks[t]![step] = !this.locks[t]![step];
    this.emit();
  }

  /** One-note / step edit on working (with undo). */
  editStep(
    track: number,
    step: number,
    patch: Partial<Pick<SeqStep, 'pitch' | 'velocity' | 'gate' | 'on'>>,
  ): void {
    const t = track - 1;
    if (t < 0 || t >= SEQ_TRACK_COUNT) return;
    if (step < 0 || step >= SEQ_STEP_COUNT) return;
    const next = clonePattern(this.working);
    const cur = next.tracks[t]!.steps[step]!;
    let pitch = patch.pitch !== undefined ? patch.pitch : cur.pitch;
    if (patch.pitch !== undefined) {
      pitch = quantizePitch(pitch, this.settings.root, this.settings.scaleId);
    }
    next.tracks[t]!.steps[step] = {
      on: patch.on !== undefined ? patch.on : cur.on,
      pitch,
      velocity: patch.velocity !== undefined ? patch.velocity : cur.velocity,
      gate: patch.gate !== undefined ? patch.gate : cur.gate,
    };
    this.commit(next);
  }

  /** Sync working from an external pattern edit (e.g. main seq grid) without treating as generate. */
  adoptWorking(pattern: SeqPattern, pushUndo = true): void {
    if (pushUndo) this.commit(pattern);
    else {
      this.working = clonePattern(pattern);
      this.emit();
    }
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.working = clonePattern(prev);
    this.emit();
  }

  clearLocks(): void {
    this.locks = emptyLocks();
    this.emit();
  }
}

function sanitizeSettings(s: Partial<GenerativeSettings> & { scaleId?: ScaleId }): GenerativeSettings {
  return {
    root: clampRoot(s.root ?? DEFAULT_GENERATIVE_SETTINGS.root),
    scaleId: s.scaleId ?? DEFAULT_GENERATIVE_SETTINGS.scaleId,
    density: clamp01(s.density ?? DEFAULT_GENERATIVE_SETTINGS.density),
    mutation: clamp01(s.mutation ?? DEFAULT_GENERATIVE_SETTINGS.mutation),
    seed: (s.seed ?? DEFAULT_GENERATIVE_SETTINGS.seed) >>> 0,
  };
}
