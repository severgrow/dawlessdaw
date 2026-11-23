/**
 * Scale engine for Circuit P1 generative sequencing.
 * Pure music theory + seeded RNG — no MIDI I/O.
 */

export type ScaleId =
  | 'chromatic'
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'pentatonicMajor'
  | 'pentatonicMinor'
  | 'blues'
  | 'harmonicMinor'
  | 'melodicMinor';

export interface ScaleDef {
  id: ScaleId;
  name: string;
  /** Semitone offsets from root within an octave */
  intervals: readonly number[];
}

/** Listed scales available in the generative UI. */
export const SCALES: readonly ScaleDef[] = [
  { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'pentatonicMajor', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'pentatonicMinor', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'harmonicMinor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodicMinor', name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
] as const;

const SCALE_BY_ID: Record<ScaleId, ScaleDef> = Object.fromEntries(
  SCALES.map((s) => [s.id, s]),
) as Record<ScaleId, ScaleDef>;

export function getScale(id: ScaleId): ScaleDef {
  return SCALE_BY_ID[id] ?? SCALE_BY_ID.minor;
}

export function isScaleId(v: unknown): v is ScaleId {
  return typeof v === 'string' && v in SCALE_BY_ID;
}

/** Pitch-class (0–11) membership relative to root. */
export function pitchClassInScale(pc: number, root: number, scaleId: ScaleId): boolean {
  const intervals = getScale(scaleId).intervals;
  const rel = ((pc % 12) - (root % 12) + 12) % 12;
  return intervals.includes(rel);
}

/** Snap MIDI note 0–127 to nearest in-scale pitch (prefer lower on ties). */
export function quantizePitch(note: number, root: number, scaleId: ScaleId): number {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  if (pitchClassInScale(n, root, scaleId)) return n;
  for (let d = 1; d <= 6; d++) {
    const lo = n - d;
    const hi = n + d;
    if (lo >= 0 && pitchClassInScale(lo, root, scaleId)) return lo;
    if (hi <= 127 && pitchClassInScale(hi, root, scaleId)) return hi;
  }
  return n;
}

/** All in-scale MIDI notes in [lo, hi]. */
export function scalePitches(root: number, scaleId: ScaleId, lo = 36, hi = 84): number[] {
  const out: number[] = [];
  const low = Math.max(0, Math.min(127, lo));
  const high = Math.max(low, Math.min(127, hi));
  for (let n = low; n <= high; n++) {
    if (pitchClassInScale(n, root, scaleId)) out.push(n);
  }
  return out.length ? out : [Math.max(0, Math.min(127, 60 + (root % 12)))];
}

/**
 * Mulberry32 — deterministic, fast, good enough for musical density/mutation.
 * Same seed → same sequence (tests + reproducible Generate).
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Mix seed so small integers still diverge.
    let s = (seed >>> 0) ^ 0x9e3779b9;
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
    this.state = (s ^ (s >>> 16)) >>> 0;
  }

  /** Uniform [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('SeededRng.pick: empty');
    return items[this.nextInt(items.length)]!;
  }

  /** Bernoulli trial. */
  chance(p: number): boolean {
    return this.next() < Math.max(0, Math.min(1, p));
  }
}

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export function rootLabel(root: number): string {
  return NOTE_NAMES[((root % 12) + 12) % 12]!;
}
