import { describe, it, expect } from 'vitest';
import {
  assessAlignment,
  barDurationMs,
  buildTrimFromCapture,
  expectedContentFrames,
  framesForMs,
  isBarBoundary,
  planCaptureWindow,
} from './timing';
import { FLIP_POST_ROLL_MS, FLIP_PRE_ROLL_MS } from './types';

describe('FLIP timing', () => {
  it('4 bars at 120 BPM = 8000 ms content', () => {
    expect(barDurationMs(120, 4)).toBe(8000);
    expect(barDurationMs(120, 1)).toBe(2000);
    expect(barDurationMs(120, 8)).toBe(16000);
  });

  it('capture window includes pre/post roll', () => {
    const w = planCaptureWindow(120, 4);
    expect(w.contentMs).toBe(8000);
    expect(w.preRollMs).toBe(FLIP_PRE_ROLL_MS);
    expect(w.postRollMs).toBe(FLIP_POST_ROLL_MS);
    expect(w.totalMs).toBe(8000 + FLIP_PRE_ROLL_MS + FLIP_POST_ROLL_MS);
  });

  it('latency offset shifts trim start without stretching', () => {
    const sr = 48000;
    const bpm = 120;
    const bars = 4 as const;
    const content = expectedContentFrames(bpm, bars, sr);
    const pre = framesForMs(FLIP_PRE_ROLL_MS, sr);
    const post = framesForMs(FLIP_POST_ROLL_MS, sr);
    const offsetMs = 20;
    const offsetFrames = framesForMs(offsetMs, sr);
    const frameCount = pre + content + post + offsetFrames;
    const trim = buildTrimFromCapture({
      frameCount,
      sampleRate: sr,
      bpm,
      bars,
      captureOffsetMs: offsetMs,
    });
    expect(trim.startFrame).toBe(pre + offsetFrames);
    expect(trim.endFrame - trim.startFrame).toBe(content);
  });

  it('bar boundary is step multiples of 16', () => {
    expect(isBarBoundary(0)).toBe(true);
    expect(isBarBoundary(16)).toBe(true);
    expect(isBarBoundary(1)).toBe(false);
    expect(isBarBoundary(-1)).toBe(false);
  });

  it('unquantised capture is labelled unaligned — no fake stretch', () => {
    const a = assessAlignment({
      quantized: false,
      clockSource: 'none',
      captureOffsetMs: 0,
      calibrated: false,
      trimExact: false,
    });
    expect(a.alignment).toBe('unaligned');
    expect(a.confidence).toBe('none');
  });

  it('offset_applied when capture offset non-zero', () => {
    const a = assessAlignment({
      quantized: true,
      clockSource: 'circuit',
      captureOffsetMs: 12,
      calibrated: true,
      trimExact: true,
    });
    expect(a.alignment).toBe('offset_applied');
    expect(a.confidence).toBe('high');
  });
});
