import { describe, expect, it } from 'vitest';
import {
  SeededRng,
  SCALES,
  getScale,
  pitchClassInScale,
  quantizePitch,
  rootLabel,
  scalePitches,
} from './scale';

describe('scale engine', () => {
  it('lists known scales with intervals', () => {
    expect(SCALES.length).toBeGreaterThanOrEqual(10);
    expect(getScale('minor').intervals).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(getScale('major').name).toBe('Major');
  });

  it('checks pitch-class membership for A minor', () => {
    // A=9 → A minor notes: A B C D E F G
    expect(pitchClassInScale(9, 9, 'minor')).toBe(true); // A
    expect(pitchClassInScale(0, 9, 'minor')).toBe(true); // C
    expect(pitchClassInScale(1, 9, 'minor')).toBe(false); // C#
  });

  it('quantizes to nearest in-scale pitch', () => {
    // C major: C# (61) → C (60)
    expect(quantizePitch(61, 0, 'major')).toBe(60);
    expect(quantizePitch(60, 0, 'major')).toBe(60);
  });

  it('enumerates scale pitches in range', () => {
    const pitches = scalePitches(0, 'pentatonicMinor', 60, 72);
    expect(pitches.every((n) => pitchClassInScale(n, 0, 'pentatonicMinor'))).toBe(true);
    expect(pitches[0]).toBeGreaterThanOrEqual(60);
  });

  it('SeededRng is deterministic', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = [a.next(), a.next(), a.nextInt(10), a.chance(0.5)];
    const seqB = [b.next(), b.next(), b.nextInt(10), b.chance(0.5)];
    expect(seqA).toEqual(seqB);
    const c = new SeededRng(99);
    expect(c.next()).not.toBe(seqA[0]);
  });

  it('rootLabel maps pitch class', () => {
    expect(rootLabel(9)).toBe('A');
    expect(rootLabel(0)).toBe('C');
  });
});
