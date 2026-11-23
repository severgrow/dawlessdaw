import { expect, it } from 'vitest';
import { applyEuclideanRhythm } from './euclidean';
import { createPattern } from './pattern';

it('rotates a 5/16 rhythm deterministically on one track with predictable pitches', () => {
  const base = createPattern(1);
  base.tracks[4]!.steps[2] = { on: true, pitch: 73, velocity: 61, gate: 0.42 };
  const settings = { track: 5, hits: 5, steps: 16, rotation: 2 };
  const result = applyEuclideanRhythm(base, [], settings);
  expect(result).toEqual(applyEuclideanRhythm(base, [], settings));
  expect(result.hits).toBe(5);
  const track = result.pattern.tracks[4]!;
  expect(track.steps.flatMap((step, i) => step.on ? [i] : [])).toEqual([2, 5, 8, 11, 14]);
  expect(track.steps[2]).toEqual(base.tracks[4]!.steps[2]);
  expect(track.steps[5]!.pitch).toBe(track.defaultPitch);
  expect(result.pattern.tracks[0]).toEqual(base.tracks[0]);
});

it('reports conflicts and preserves locked on and off steps and notes outside the span', () => {
  const base = createPattern(1);
  base.tracks[0]!.steps[1]!.on = true;
  base.tracks[0]!.steps[12]!.on = true;
  const result = applyEuclideanRhythm(base, [[true, true, false, false, true]], {
    track: 1, hits: 2, steps: 8, rotation: 0,
  });
  expect(result).toMatchObject({ hits: 1, blocked: 3 });
  expect(result.pattern.tracks[0]!.steps.flatMap((step, i) => step.on ? [i] : [])).toEqual([1, 12]);
  expect(result.pattern.length).toBe(16);
});
