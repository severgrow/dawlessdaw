import { expect, it } from 'vitest';
import type { Song, SongPart } from './song';
import { placePart } from './songParts';
import { readSongBackup, songBackup } from './songBackup';

it('round-trips the arrangement, Part links and mute state', () => {
  const part: SongPart = {
    id: 'verse', name: 'Verse', bpm: 110, length: 2,
    lanes: [{ track: 1, notes: [{ at: 2.5, end: 6, pitch: 52, velocity: 118 }] }],
  };
  const song: Song = { bpm: 110, clips: [], parts: [part], mutedTracks: [1] };
  const placed = placePart(song, part, 2, true);
  if ('error' in placed) throw new Error(placed.error);
  expect(readSongBackup(songBackup(placed.song))).toEqual(placed.song);
  expect(() => readSongBackup('{}')).toThrow(/SPLOT Song backup/);
  expect(() => readSongBackup(songBackup({ ...placed.song, parts: [] }))).toThrow(/incomplete/);
});
