/**
 * FLIP audio processing — trim / reverse / fades / equal CHOP.
 * All operations copy; stored take PCM is never rewritten.
 */
import { applyFadeInOut, sliceStereo } from '../recorder/pcmMath';
import type { StereoAudio } from '../recorder/types';
import type { FlipChop, FlipClipMeta, FlipTrim } from './types';

export function applyTrim(audio: StereoAudio, trim: FlipTrim): StereoAudio {
  return sliceStereo(audio, trim.startFrame, trim.endFrame);
}

export function reverseStereo(audio: StereoAudio): StereoAudio {
  const left = audio.left.slice().reverse();
  const right = audio.right.slice().reverse();
  return { sampleRate: audio.sampleRate, left, right };
}

export function applyFades(
  audio: StereoAudio,
  fadeInMs: number,
  fadeOutMs: number,
): StereoAudio {
  const n = audio.left.length;
  if (n === 0) {
    return {
      sampleRate: audio.sampleRate,
      left: audio.left.slice(),
      right: audio.right.slice(),
    };
  }
  const left = audio.left.slice();
  const right = audio.right.slice();
  const inFrames = Math.min(
    Math.floor((Math.max(0, fadeInMs) / 1000) * audio.sampleRate),
    Math.floor(n / 2),
  );
  const outFrames = Math.min(
    Math.floor((Math.max(0, fadeOutMs) / 1000) * audio.sampleRate),
    Math.floor(n / 2),
  );
  for (let i = 0; i < inFrames; i++) {
    const g = inFrames <= 1 ? 1 : i / (inFrames - 1 || 1);
    left[i]! *= g;
    right[i]! *= g;
  }
  for (let i = 0; i < outFrames; i++) {
    const g = outFrames <= 1 ? 1 : i / (outFrames - 1 || 1);
    const j = n - 1 - i;
    left[j]! *= g;
    right[j]! *= g;
  }
  return { sampleRate: audio.sampleRate, left, right };
}

export function applyGain(audio: StereoAudio, gain: number): StereoAudio {
  const g = Number.isFinite(gain) ? Math.max(0, Math.min(4, gain)) : 1;
  if (g === 1) {
    return {
      sampleRate: audio.sampleRate,
      left: audio.left.slice(),
      right: audio.right.slice(),
    };
  }
  const left = new Float32Array(audio.left.length);
  const right = new Float32Array(audio.right.length);
  for (let i = 0; i < audio.left.length; i++) {
    left[i] = audio.left[i]! * g;
    right[i] = audio.right[i]! * g;
  }
  return { sampleRate: audio.sampleRate, left, right };
}

export function chopEqual(
  audio: StereoAudio,
  slices: FlipChop['slices'],
): StereoAudio[] {
  const n = Math.min(audio.left.length, audio.right.length);
  if (n === 0 || slices < 1) return [];
  const out: StereoAudio[] = [];
  for (let s = 0; s < slices; s++) {
    const start = Math.floor((s * n) / slices);
    const end = Math.floor(((s + 1) * n) / slices);
    out.push(sliceStereo(audio, start, end));
  }
  return out;
}

export type RenderFlipOpts = {
  /**
   * When false, skip clip.gain (P2 single-gain path: bake edits only;
   * live GainNode applies gain once during playback).
   * Default true — export / getRenderedAudio bake gain into PCM.
   */
  applyClipGain?: boolean;
};

export function renderFlipAudio(
  source: StereoAudio,
  clip: Pick<
    FlipClipMeta,
    'trim' | 'reverse' | 'fadeInMs' | 'fadeOutMs' | 'gain'
  >,
  opts: RenderFlipOpts = {},
): StereoAudio {
  const applyClipGain = opts.applyClipGain !== false;
  let audio = applyTrim(source, clip.trim);
  if (clip.reverse) audio = reverseStereo(audio);
  if (clip.fadeInMs > 0 || clip.fadeOutMs > 0) {
    audio = applyFades(audio, clip.fadeInMs, clip.fadeOutMs);
  }
  if (applyClipGain && clip.gain !== 1) audio = applyGain(audio, clip.gain);
  return audio;
}

/**
 * P2 gain matrix: playback must apply gain **once**.
 * - bufferGain: always 1 (edits without bake)
 * - nodeGain: clip.gain on the live GainNode
 * Export keeps `renderFlipAudio(..., { applyClipGain: true })` (default).
 */
export function resolveFlipPlaybackGain(clipGain: number): {
  bufferApplyClipGain: false;
  nodeGain: number;
} {
  const g = Number.isFinite(clipGain) ? Math.max(0, Math.min(4, clipGain)) : 1;
  return { bufferApplyClipGain: false, nodeGain: g };
}

export function softEdge(audio: StereoAudio, ms = 10): StereoAudio {
  return applyFadeInOut(audio, ms);
}

export function sliceBounds(
  frameCount: number,
  slices: FlipChop['slices'],
  index: number,
): FlipTrim {
  const start = Math.floor((index * frameCount) / slices);
  const end = Math.floor(((index + 1) * frameCount) / slices);
  return { startFrame: start, endFrame: Math.max(start, end) };
}
