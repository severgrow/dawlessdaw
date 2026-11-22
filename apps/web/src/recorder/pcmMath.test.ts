import { describe, it, expect } from 'vitest';
import {
  applyFadeInOut,
  clampTrim,
  markerAtSeconds,
  nearestMarker,
  normalizeStereo,
  peakLinear,
  prepareForExport,
  sliceStereo,
  snapFrameToMarkers,
  splitRegionsAtMarkers,
} from './pcmMath';
import type { StereoAudio } from './types';
import { NORMALIZE_TARGET_LINEAR } from './types';

const stereo = (L: number[], R?: number[], sr = 1000): StereoAudio => ({
  sampleRate: sr,
  left: Float32Array.from(L),
  right: Float32Array.from(R ?? L),
});

describe('pcmMath', () => {
  it('maps markers ↔ samples', () => {
    const m = markerAtSeconds(1.5, 48000, 'A', 'manual');
    expect(m.sample).toBe(72000);
    expect(m.seconds).toBeCloseTo(1.5, 5);
  });

  it('snaps frames to nearby markers', () => {
    const markers = [
      markerAtSeconds(1, 1000, 'a', 'manual'),
      markerAtSeconds(2, 1000, 'b', 'circuit-project'),
    ];
    expect(snapFrameToMarkers(1010, markers, 1000, 0.05)).toBe(1000);
    expect(snapFrameToMarkers(1500, markers, 1000, 0.05)).toBe(1500);
    expect(nearestMarker(1990, markers, 20)?.label).toBe('b');
  });

  it('trims without mutating source', () => {
    const src = stereo([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = sliceStereo(src, 2, 5);
    expect(Array.from(out.left)).toEqual([2, 3, 4]);
    expect(src.left[2]).toBe(2);
    expect(src.left.length).toBe(10);
  });

  it('applies 10 ms fade in/out maths', () => {
    // 1000 Hz → 10 ms = 10 frames
    const src = stereo(Array(40).fill(1));
    const faded = applyFadeInOut(src, 10);
    expect(faded.left[0]).toBeCloseTo(0, 5);
    expect(faded.left[9]).toBeCloseTo(1, 5);
    expect(faded.left[39]).toBeCloseTo(0, 5);
    expect(faded.left[20]).toBeCloseTo(1, 5);
    expect(src.left[0]).toBe(1); // source untouched
  });

  it('normalizes peak to −1 dBFS', () => {
    const out = normalizeStereo(stereo([0.1, -0.5]));
    expect(peakLinear(out)).toBeCloseTo(NORMALIZE_TARGET_LINEAR, 4);
  });

  it('prepareForExport clamps trim and never mutates', () => {
    const src = stereo(Array(100).fill(0.5));
    const out = prepareForExport(src, {
      startFrame: -10,
      endFrame: 1000,
      fadeInOutMs: 0,
      normalize: false,
      snapToMarkers: false,
    });
    expect(out.left.length).toBe(100);
    expect(src.left[0]).toBe(0.5);
    const clamped = clampTrim(
      { startFrame: 10, endFrame: 5, fadeInOutMs: 0, normalize: false, snapToMarkers: false },
      100,
    );
    expect(clamped.endFrame).toBeGreaterThanOrEqual(clamped.startFrame);
  });

  it('splits at markers without gaps or overlaps', () => {
    const markers = [
      markerAtSeconds(1, 100, 'a', 'manual'),
      markerAtSeconds(2, 100, 'b', 'manual'),
    ];
    const regions = splitRegionsAtMarkers(0, 300, markers);
    expect(regions).toEqual([
      { startFrame: 0, endFrame: 100, label: 'part-1' },
      { startFrame: 100, endFrame: 200, label: 'part-2' },
      { startFrame: 200, endFrame: 300, label: 'part-3' },
    ]);
    // contiguous
    for (let i = 0; i < regions.length - 1; i++) {
      expect(regions[i]!.endFrame).toBe(regions[i + 1]!.startFrame);
    }
  });
});
