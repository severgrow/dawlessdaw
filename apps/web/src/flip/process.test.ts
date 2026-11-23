import { describe, it, expect } from 'vitest';
import {
  applyFades,
  applyGain,
  chopEqual,
  renderFlipAudio,
  resolveFlipPlaybackGain,
  reverseStereo,
} from './process';
import type { StereoAudio } from '../recorder/types';

function ramp(n: number): StereoAudio {
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = i / n;
    right[i] = 1 - i / n;
  }
  return { sampleRate: 48000, left, right };
}

describe('FLIP process', () => {
  it('reverse flips sample order', () => {
    const a = ramp(4);
    const r = reverseStereo(a);
    expect([...r.left]).toEqual([0.75, 0.5, 0.25, 0]);
    expect(a.left[0]).toBe(0);
  });

  it('fades do not mutate source', () => {
    const a = ramp(100);
    const before = a.left[0];
    const faded = applyFades(a, 10, 10);
    expect(a.left[0]).toBe(before);
    expect(faded.left[0]).toBe(0);
    expect(faded.left[99]).toBe(0);
  });

  it('chopEqual splits into equal frame counts (±1)', () => {
    const a = ramp(160);
    const parts = chopEqual(a, 8);
    expect(parts).toHaveLength(8);
    const total = parts.reduce((s, p) => s + p.left.length, 0);
    expect(total).toBe(160);
    for (const p of parts) {
      expect(p.left.length).toBeGreaterThanOrEqual(19);
      expect(p.left.length).toBeLessThanOrEqual(21);
    }
  });

  it('renderFlipAudio applies trim → reverse → gain', () => {
    const a = ramp(100);
    const out = renderFlipAudio(a, {
      trim: { startFrame: 10, endFrame: 50 },
      reverse: true,
      fadeInMs: 0,
      fadeOutMs: 0,
      gain: 2,
    });
    expect(out.left.length).toBe(40);
    expect(out.left[0]!).toBeCloseTo((49 / 100) * 2, 5);
  });

  it('applyGain clamps', () => {
    const a = ramp(2);
    const g = applyGain(a, 100);
    expect(g.left[1]!).toBeCloseTo((1 / 2) * 4, 5);
  });

  it('P2 gain matrix: playback applies gain once (not bake × node)', () => {
    const a = ramp(4);
    const clip = {
      trim: { startFrame: 0, endFrame: 4 },
      reverse: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      gain: 2,
    };
    const baked = renderFlipAudio(a, clip); // export path
    expect(baked.left[1]!).toBeCloseTo((1 / 4) * 2, 5);

    const forPlay = renderFlipAudio(a, clip, { applyClipGain: false });
    const plan = resolveFlipPlaybackGain(clip.gain);
    expect(plan.bufferApplyClipGain).toBe(false);
    expect(plan.nodeGain).toBe(2);
    // Effective = buffer × node — must equal single bake, not gain²
    expect(forPlay.left[1]! * plan.nodeGain).toBeCloseTo(baked.left[1]!, 5);
    expect(forPlay.left[1]! * plan.nodeGain).not.toBeCloseTo(
      (1 / 4) * 2 * 2,
      5,
    );
  });

  it('resolveFlipPlaybackGain clamps node gain', () => {
    expect(resolveFlipPlaybackGain(100).nodeGain).toBe(4);
    expect(resolveFlipPlaybackGain(-1).nodeGain).toBe(0);
  });
});
