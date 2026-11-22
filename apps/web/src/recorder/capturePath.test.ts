/**
 * Sine through the capture→export maths path (no getUserMedia in node).
 * Checks exported WAV length and level within ±0.1 dB.
 */
import { describe, it, expect } from 'vitest';
import { prepareForExport, peakLinear } from './pcmMath';
import { encodeWav, parseWavHeader } from './wav';
import { stitchChunks } from './stitch';
import type { StereoAudio } from './types';
import { NORMALIZE_TARGET_LINEAR } from './types';

function sineStereo(
  seconds: number,
  sampleRate: number,
  freq = 440,
  amp = 0.5,
): StereoAudio {
  const n = Math.round(seconds * sampleRate);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    left[i] = s;
    right[i] = s;
  }
  return { sampleRate, left, right };
}

function linearToDb(x: number): number {
  return 20 * Math.log10(Math.max(1e-12, x));
}

describe('sine through capture path', () => {
  it('stitches worklet-sized chunks then exports WAV with correct length/level', () => {
    const sr = 48000;
    const seconds = 0.5;
    const amp = 0.5;
    const full = sineStereo(seconds, sr, 440, amp);

    // Simulate AudioWorklet block size 128 frames → interleaved chunks
    const block = 128;
    const chunks = [];
    let index = 0;
    for (let f = 0; f < full.left.length; f += block) {
      const end = Math.min(full.left.length, f + block);
      const frames = end - f;
      const interleaved = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        interleaved[i * 2] = full.left[f + i]!;
        interleaved[i * 2 + 1] = full.right[f + i]!;
      }
      chunks.push({ index: index++, samples: interleaved });
    }

    const stitched = stitchChunks(chunks, sr);
    expect(stitched.left.length).toBe(full.left.length);

    const prepared = prepareForExport(stitched, {
      startFrame: 0,
      endFrame: stitched.left.length,
      fadeInOutMs: 0,
      normalize: false,
      snapToMarkers: false,
    });
    const buf = encodeWav(prepared, 24);
    const h = parseWavHeader(buf);
    expect(h.sampleRate).toBe(sr);
    expect(h.dataSize / 6).toBe(prepared.left.length); // 24-bit stereo = 6 bytes/frame

    const peakDb = linearToDb(peakLinear(prepared));
    const expectedDb = linearToDb(amp);
    expect(Math.abs(peakDb - expectedDb)).toBeLessThanOrEqual(0.1);
  });

  it('normalize export hits −1 dBFS ±0.1 dB', () => {
    const src = sineStereo(0.2, 48000, 880, 0.2);
    const out = prepareForExport(src, {
      startFrame: 0,
      endFrame: src.left.length,
      fadeInOutMs: 0,
      normalize: true,
      snapToMarkers: false,
    });
    const db = linearToDb(peakLinear(out));
    const target = linearToDb(NORMALIZE_TARGET_LINEAR);
    expect(Math.abs(db - target)).toBeLessThanOrEqual(0.1);
  });
});
