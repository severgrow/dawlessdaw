/**
 * Pure PCM helpers for Session Recorder (trim / fade / normalize / markers).
 * Trim is export-only — callers must never mutate the stored take.
 */
import {
  CLIP_LINEAR,
  DEFAULT_FADE_MS,
  NORMALIZE_TARGET_LINEAR,
  type StereoAudio,
  type TakeMarker,
  type TrimEdit,
} from './types';

export function framesToSeconds(frames: number, sampleRate: number): number {
  return sampleRate > 0 ? frames / sampleRate : 0;
}

export function secondsToFrames(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export function markerAtSeconds(
  seconds: number,
  sampleRate: number,
  label: string,
  source: TakeMarker['source'],
): TakeMarker {
  const sample = Math.max(0, secondsToFrames(seconds, sampleRate));
  return { sample, seconds: framesToSeconds(sample, sampleRate), label, source };
}

/** Nearest marker within `windowFrames`, or null. */
export function nearestMarker(
  frame: number,
  markers: TakeMarker[],
  windowFrames: number,
): TakeMarker | null {
  let best: TakeMarker | null = null;
  let bestDist = Infinity;
  for (const m of markers) {
    const d = Math.abs(m.sample - frame);
    if (d <= windowFrames && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

export function snapFrameToMarkers(
  frame: number,
  markers: TakeMarker[],
  sampleRate: number,
  windowSec = 0.05,
): number {
  const hit = nearestMarker(frame, markers, secondsToFrames(windowSec, sampleRate));
  return hit ? hit.sample : frame;
}

export function clampTrim(edit: TrimEdit, frameCount: number): TrimEdit {
  const start = Math.max(0, Math.min(frameCount, Math.floor(edit.startFrame)));
  const end = Math.max(start, Math.min(frameCount, Math.floor(edit.endFrame)));
  return { ...edit, startFrame: start, endFrame: end };
}

/** Copy a stereo region (export-only — does not mutate source). */
export function sliceStereo(audio: StereoAudio, startFrame: number, endFrame: number): StereoAudio {
  const start = Math.max(0, Math.min(audio.left.length, startFrame));
  const end = Math.max(start, Math.min(audio.left.length, endFrame));
  return {
    sampleRate: audio.sampleRate,
    left: audio.left.slice(start, end),
    right: audio.right.slice(start, end),
  };
}

/** Apply linear fade in/out over `fadeMs` at both ends (in place on a copy). */
export function applyFadeInOut(audio: StereoAudio, fadeMs = DEFAULT_FADE_MS): StereoAudio {
  const n = audio.left.length;
  if (n === 0 || fadeMs <= 0) {
    return {
      sampleRate: audio.sampleRate,
      left: audio.left.slice(),
      right: audio.right.slice(),
    };
  }
  const fadeFrames = Math.min(Math.floor((fadeMs / 1000) * audio.sampleRate), Math.floor(n / 2));
  const left = audio.left.slice();
  const right = audio.right.slice();
  for (let i = 0; i < fadeFrames; i++) {
    const g = fadeFrames <= 1 ? 1 : i / (fadeFrames - 1 || 1);
    left[i]! *= g;
    right[i]! *= g;
    const j = n - 1 - i;
    left[j]! *= g;
    right[j]! *= g;
  }
  return { sampleRate: audio.sampleRate, left, right };
}

export function peakLinear(audio: StereoAudio): number {
  let peak = 0;
  for (let i = 0; i < audio.left.length; i++) {
    const a = Math.abs(audio.left[i]!);
    const b = Math.abs(audio.right[i]!);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  return peak;
}

/** Scale peak to target linear (default −1 dBFS). Silence unchanged. */
export function normalizeStereo(
  audio: StereoAudio,
  target = NORMALIZE_TARGET_LINEAR,
): StereoAudio {
  const peak = peakLinear(audio);
  if (peak === 0) {
    return {
      sampleRate: audio.sampleRate,
      left: audio.left.slice(),
      right: audio.right.slice(),
    };
  }
  const gain = target / peak;
  const left = new Float32Array(audio.left.length);
  const right = new Float32Array(audio.right.length);
  for (let i = 0; i < audio.left.length; i++) {
    left[i] = audio.left[i]! * gain;
    right[i] = audio.right[i]! * gain;
  }
  return { sampleRate: audio.sampleRate, left, right };
}

/** Full export prep: slice → optional fade → optional normalize. Never mutates source. */
export function prepareForExport(audio: StereoAudio, edit: TrimEdit): StereoAudio {
  const clamped = clampTrim(edit, audio.left.length);
  let out = sliceStereo(audio, clamped.startFrame, clamped.endFrame);
  if (clamped.fadeInOutMs > 0) out = applyFadeInOut(out, clamped.fadeInOutMs);
  if (clamped.normalize) out = normalizeStereo(out);
  return out;
}

/**
 * Split a trimmed region at markers that fall strictly inside (start, end).
 * Returns contiguous regions covering the trim without gaps or overlaps.
 */
export function splitRegionsAtMarkers(
  startFrame: number,
  endFrame: number,
  markers: TakeMarker[],
): { startFrame: number; endFrame: number; label: string }[] {
  const interior = markers
    .map((m) => m.sample)
    .filter((s) => s > startFrame && s < endFrame)
    .sort((a, b) => a - b);
  const cuts = [startFrame, ...interior, endFrame];
  const regions: { startFrame: number; endFrame: number; label: string }[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    if (b > a) regions.push({ startFrame: a, endFrame: b, label: `part-${i + 1}` });
  }
  return regions.length ? regions : [{ startFrame, endFrame, label: 'part-1' }];
}

export function isClipping(peak: number): boolean {
  return peak >= CLIP_LINEAR;
}

/** Peak per bucket for waveform drawing (max of |L|, |R|). */
export function stereoPeaks(audio: StereoAudio, buckets: number): number[] {
  const len = audio.left.length;
  if (len === 0 || buckets <= 0) return [];
  const size = Math.max(1, Math.floor(len / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * size;
    const end = Math.min(len, start + size);
    for (let i = start; i < end; i++) {
      const v = Math.max(Math.abs(audio.left[i]!), Math.abs(audio.right[i]!));
      if (v > peak) peak = v;
    }
    peaks.push(peak);
  }
  return peaks;
}

/** De-interleave LRLR… into separate channels. */
export function deinterleave(interleaved: Float32Array): { left: Float32Array; right: Float32Array } {
  const frames = Math.floor(interleaved.length / 2);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2]!;
    right[i] = interleaved[i * 2 + 1]!;
  }
  return { left, right };
}

/** Interleave two channels to LRLR… */
export function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = left[i]!;
    out[i * 2 + 1] = right[i]!;
  }
  return out;
}
