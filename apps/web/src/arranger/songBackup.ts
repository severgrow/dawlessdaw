import { loadSong, type Song } from './song';

const FORMAT = 'splot-song';

export function songBackup(song: Song): string {
  return JSON.stringify({ format: FORMAT, version: 1, song });
}

export function readSongBackup(text: string): Song {
  const data = JSON.parse(text);
  if (data?.format !== FORMAT || data.version !== 1 || !Array.isArray(data.song?.clips) ||
      !Number.isFinite(data.song.bpm) || data.song.bpm < 20 || data.song.bpm > 400 ||
      (data.song.parts != null && !Array.isArray(data.song.parts))) {
    throw new Error('Choose a SPLOT Song backup (.json).');
  }
  const song = loadSong({ getItem: () => JSON.stringify(data.song) });
  const complete = song.clips.length === data.song.clips.length &&
    (song.parts?.length ?? 0) === (data.song.parts?.length ?? 0) &&
    song.clips.every((clip, i) => clip.notes.length === data.song.clips[i]?.notes?.length &&
      clip.partId === data.song.clips[i]?.partId) &&
    (song.parts ?? []).every((part, i) => part.lanes.length === data.song.parts[i]?.lanes?.length &&
      part.lanes.every((lane, j) => lane.notes.length === data.song.parts[i]?.lanes[j]?.notes?.length));
  if (!complete) throw new Error('This backup contains incomplete or overlapping clips.');
  return song;
}
