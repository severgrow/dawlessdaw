import { expect, it } from 'vitest';
import { loadSong, type Song, type SongPart } from './song';
import { accentPart, placePart, removePart, updatePart } from './songParts';

const first = { at: 0, end: 2.1, pitch: 36, velocity: 100 };
const late = { at: 13.4, end: 18.2, pitch: 60, velocity: 72 };
const part: SongPart = {
  id: 'break', name: 'Break A', bpm: 110, length: 2,
  lanes: [{ track: 1, notes: [first] }, { track: 7, notes: [late] }],
};

function place(song: Song, bar: number, linked: boolean) {
  const result = placePart(song, part, bar, linked);
  if ('error' in result) throw new Error(result.error);
  return result.song;
}

it('replaces every linked placement while keeping independent copies and their timing', () => {
  const initial = { bpm: 120, clips: [], parts: [part] };
  const song = place(place(place(initial, 0, true), 2, true), 4, false);
  expect(song.bpm).toBe(110);
  const replacement = { ...part, name: 'Break B', lanes: [{ track: 7, notes: [{ ...late, velocity: 101 }] }] };
  const change = updatePart(song, replacement);
  if ('error' in change) throw new Error(change.error);
  expect(change.clips.map((clip) => [clip.bar, clip.track, clip.notes[0]?.velocity])).toEqual([[0, 7, 101], [2, 7, 101]]);
  expect(change.song.clips.filter((clip) => clip.bar === 4).map((clip) => clip.notes[0])).toEqual([first, late]);
  expect(loadSong({ getItem: () => JSON.stringify(change.song) })).toMatchObject(change.song);
});

it('reports a conflicting lane and keeps the whole edit atomic', () => {
  const song = place(place({ bpm: 110, clips: [], parts: [part] }, 0, true), 2, false);
  expect(placePart(song, part, 1, true)).toMatchObject({ error: /Track 1 is occupied/ });
  expect(updatePart(song, { ...part, length: 4 })).toMatchObject({ error: /Track 1 is occupied/ });
  expect(placePart(song, part, 31, true)).toMatchObject({ error: /end of Song/ });
  expect(song.parts).toEqual([part]);
  expect(song.clips).toHaveLength(4);
});

it('retains clips as independent when their Part is removed', () => {
  const song = place({ bpm: 110, clips: [], parts: [part] }, 0, true);
  const changed = removePart(song, part);
  expect(changed.parts).toEqual([]);
  expect(changed.clips.map((clip) => [clip.notes[0], clip.partId])).toEqual([[first, undefined], [late, undefined]]);
});

it('varies only the selected lane’s velocity without touching timing or the original', () => {
  const variation = accentPart(part, 7);
  expect(variation.id).not.toBe(part.id);
  expect(variation.lanes[0]).toEqual(part.lanes[0]);
  expect(variation.lanes[1]?.notes[0]).toEqual({ ...late, velocity: 82 });
  expect(part.lanes[1]?.notes[0]).toEqual(late);
});
