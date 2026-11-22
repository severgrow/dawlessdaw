import { describe, it, expect } from 'vitest';
import { CLIP_LINEAR } from './types';
import {
  PREVIEW_HOT_LINEAR,
  PREVIEW_SILENCE_LINEAR,
  classifyInputLevel,
  hasAudibleSignal,
  meterPct,
  peakFromAbsSamples,
  peakFromTimeDomain,
} from './inputPreviewLevels';

describe('inputPreviewLevels', () => {
  it('treats near-zero peaks as silence and larger peaks as signal', () => {
    expect(classifyInputLevel(0, 0)).toBe('silence');
    expect(classifyInputLevel(PREVIEW_SILENCE_LINEAR * 0.5, 0)).toBe('silence');
    expect(classifyInputLevel(0.02, 0.01)).toBe('signal');
    expect(hasAudibleSignal(0, 0)).toBe(false);
    expect(hasAudibleSignal(0.02, 0)).toBe(true);
  });

  it('marks hot levels near −6 dBFS', () => {
    expect(classifyInputLevel(PREVIEW_HOT_LINEAR, 0)).toBe('hot');
    expect(classifyInputLevel(0.9, 0.9)).toBe('hot');
  });

  it('computes peaks from time-domain buffers', () => {
    const buf = new Float32Array([-0.25, 0.1, 0.4, -0.05]);
    expect(peakFromTimeDomain(buf)).toBeCloseTo(0.4, 6);
    expect(peakFromAbsSamples([0, -0.5, 0.25])).toBe(0.5);
  });

  it('scales meter fill against clip threshold', () => {
    expect(meterPct(0)).toBe(0);
    expect(meterPct(CLIP_LINEAR)).toBe(100);
    expect(meterPct(CLIP_LINEAR / 2)).toBeCloseTo(50, 5);
    expect(meterPct(CLIP_LINEAR * 2)).toBe(100);
  });
});
