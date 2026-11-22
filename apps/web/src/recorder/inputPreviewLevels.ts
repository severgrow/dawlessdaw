/**
 * Pure level helpers for live input preview (FLIP / Session Recorder meters).
 * Thresholds distinguish silence vs signal without needing Web Audio in tests.
 */
import { CLIP_LINEAR } from './types';

/** Peak below this (~−50 dBFS) reads as silence on the FLIP meter. */
export const PREVIEW_SILENCE_LINEAR = Math.pow(10, -50 / 20);

/** Peak at/above this (~−6 dBFS) lights the “hot” cue. */
export const PREVIEW_HOT_LINEAR = Math.pow(10, -6 / 20);

export type InputLevelKind = 'silence' | 'signal' | 'hot';

export function peakFromAbsSamples(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  return peak;
}

/** Peak of a Float32 time-domain buffer (−1…1). */
export function peakFromTimeDomain(samples: Float32Array): number {
  return peakFromAbsSamples(samples);
}

export function classifyInputLevel(
  left: number,
  right: number,
  silence = PREVIEW_SILENCE_LINEAR,
  hot = PREVIEW_HOT_LINEAR,
): InputLevelKind {
  const peak = Math.max(left, right);
  if (peak < silence) return 'silence';
  if (peak >= hot) return 'hot';
  return 'signal';
}

/** 0–100 meter fill vs clip threshold (−0.3 dBFS). */
export function meterPct(level: number, clipLinear = CLIP_LINEAR): number {
  if (!(level > 0) || !(clipLinear > 0)) return 0;
  return Math.min(100, Math.max(0, (level / clipLinear) * 100));
}

export function hasAudibleSignal(
  left: number,
  right: number,
  silence = PREVIEW_SILENCE_LINEAR,
): boolean {
  return classifyInputLevel(left, right, silence) !== 'silence';
}
