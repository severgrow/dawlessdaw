import { loadSong, saveSong, SONG_STORAGE_KEY, type Song } from './song';

interface Snapshot {
  song: Song;
  cue: number;
  canUndo: boolean;
  canRedo: boolean;
}

const past: Song[] = [];
const future: Song[] = [];
const listeners = new Set<() => void>();
let snapshot: Snapshot | undefined;

export function getSongSnapshot(): Snapshot {
  return snapshot ??= { song: loadSong(localStorage), cue: 0, canUndo: false, canRedo: false };
}

export function subscribeSong(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(song: Song) {
  snapshot = { song, cue: snapshot?.cue ?? 0, canUndo: past.length > 0, canRedo: future.length > 0 };
  for (const listener of listeners) listener();
}

export function setSongCue(cue: number): void {
  const current = getSongSnapshot();
  if (current.cue === cue) return;
  snapshot = { ...current, cue };
  for (const listener of listeners) listener();
}

export function editSong(song: Song): void {
  const previous = getSongSnapshot().song;
  saveSong(localStorage, song);
  past.push(previous);
  if (past.length > 24) past.shift();
  future.length = 0;
  publish(song);
}

export function undoSong(redo = false): void {
  const from = redo ? future : past;
  const to = redo ? past : future;
  const song = from.at(-1);
  if (!song) return;
  saveSong(localStorage, song);
  to.push(getSongSnapshot().song);
  from.pop();
  publish(song);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SONG_STORAGE_KEY && event.key !== null) return;
    past.length = 0;
    future.length = 0;
    publish(loadSong(localStorage));
  });
}
