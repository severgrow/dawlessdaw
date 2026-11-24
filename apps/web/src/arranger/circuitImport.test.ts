import { expect, it } from 'vitest';
import { NCS_SESS_SIZE, NCS_SETT, parseNcsSession, patOff } from '@dawlessdaw/devices';
import { circuitPatternClips } from './circuitImport';
import { canPlace } from './song';

function session(rate: number) {
  const bytes = new Uint8Array(NCS_SESS_SIZE);
  bytes.set([82, 85, 83, 69]);
  const slot = patOff(57);
  bytes.set([31, 1, rate], slot + NCS_SETT);
  bytes.set([36, 6, 1, 100, 6], slot); // below the saved range
  bytes.set([38, 3, 4, 90, 4], slot + 8);
  bytes.set([75, 24, 33, 123, 1], slot + 31 * 8);
  return parseNcsSession(bytes).patterns[57]!;
}

it('preserves independent slot, active range, step 32, pitch, velocity, gates and micro hits', () => {
  const pattern = session(3);
  expect(pattern.steps[31]?.probability).toBe(1);
  const clips = circuitPatternClips(pattern, 3);
  expect(clips).toMatchObject([{
    track: 8, bar: 3, length: 2,
    notes: [
      { at: 2, end: 5, pitch: 38, velocity: 90 },
      { at: 180, end: 181, pitch: 75, velocity: 123 },
      { at: 185, end: 186, pitch: 75, velocity: 123 },
    ],
  }]);
});

it('splits slow patterns at four bars while retaining the offset of later hits', () => {
  const clips = circuitPatternClips(session(7), 24);
  expect(clips.map(({ bar, length }) => [bar, length])).toEqual([[24, 4], [28, 4]]);
  expect(clips[1]?.notes[0]).toMatchObject({ at: 336, end: 340 });
  expect(canPlace(clips, { ...clips[1]!, id: 'copy', bar: 29 })).toBe(false);
});
