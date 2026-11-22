/**
 * Stitch Float32 interleaved stereo PCM chunks with no gaps or repeats.
 * Each chunk is LRLR…; concatenated in order by index.
 */
import { deinterleave } from './pcmMath';
import type { StereoAudio } from './types';

export interface PcmChunk {
  /** Monotonic index starting at 0 */
  index: number;
  /** Interleaved stereo Float32 */
  samples: Float32Array;
}

/** Sort by index and concatenate; throws if indices gap or repeat. */
export function stitchChunks(chunks: PcmChunk[], sampleRate: number): StereoAudio {
  if (chunks.length === 0) {
    return { sampleRate, left: new Float32Array(0), right: new Float32Array(0) };
  }
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.index !== i) {
      throw new Error(
        `Chunk stitch failed: expected index ${i}, got ${sorted[i]!.index} (gap or repeat)`,
      );
    }
  }
  let total = 0;
  for (const c of sorted) total += c.samples.length;
  const interleaved = new Float32Array(total);
  let offset = 0;
  for (const c of sorted) {
    interleaved.set(c.samples, offset);
    offset += c.samples.length;
  }
  const { left, right } = deinterleave(interleaved);
  return { sampleRate, left, right };
}

/** Byte estimate for stereo Float32 PCM of `frames` duration. */
export function bytesForStereoFloat(frames: number): number {
  return frames * 2 * 4;
}

/** Rough minutes remaining given free bytes and sample rate (stereo float capture). */
export function minutesRemaining(freeBytes: number, sampleRate: number): number {
  if (freeBytes <= 0 || sampleRate <= 0) return 0;
  const bytesPerSec = sampleRate * 2 * 4;
  return freeBytes / bytesPerSec / 60;
}
