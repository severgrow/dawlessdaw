import type { RecordedMidiEvent } from '@dawlessdaw/midi';
import { CAPTURE_CLOCKS_PER_BAR as TICKS_PER_BAR } from '@dawlessdaw/midi';

export const SONG_BARS = 32;
export const CLIP_LENGTHS = [1, 2, 4] as const;
export const SONG_TRACKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const SONG_STORAGE_KEY = 'dawlessdaw.song.v1';

export type ClipLength = (typeof CLIP_LENGTHS)[number];
export interface ClipNote {
  at: number;
  end: number;
  pitch: number;
  velocity: number;
}
export interface SongClip {
  id: string;
  track: number;
  bar: number;
  length: ClipLength;
  notes: ClipNote[];
}
export interface Song {
  bpm: number;
  clips: SongClip[];
  mutedTracks?: number[];
}
export interface SongEvent {
  tick: number;
  track: number;
  pitch: number;
  velocity: number; // zero is a release
}
type Capture = { bpm: number; clips: Omit<SongClip, 'id' | 'bar'>[] } | { error: string };

export function captureSongClips(
  events: readonly RecordedMidiEvent[],
  port: string,
  length: ClipLength,
  quantize = false,
): Capture {
  const circuit = events.filter((event) =>
    event.source.kind === 'incoming' && event.source.portId === port,
  );
  // A Continue starts a new contiguous clock segment. A Stop preserves the
  // previous segment for capture and excludes pads played with transport stopped.
  let from = circuit.length - 1;
  while (from >= 0 && circuit[from]?.kind !== 'start' && circuit[from]?.kind !== 'continue') from--;
  const until = circuit.findIndex((event, i) => i > from && event.kind === 'stop');
  const run = circuit.slice(from + 1, until === -1 ? undefined : until);
  const clock = new Map<number, number>();
  for (const event of run) {
    if (event.kind === 'clock' && event.position?.transport === 'playing') {
      // The first clock pulse is step one, matching the Circuit-follow sequencer.
      clock.set(event.position.tickCount - 1, event.atMs);
    }
  }
  const lastTick = [...clock.keys()].at(-1) ?? 0;
  const endTick = Math.floor(lastTick / TICKS_PER_BAR) * TICKS_PER_BAR;
  const span = length * TICKS_PER_BAR;
  const startTick = endTick - span;
  const startTime = clock.get(startTick);
  const endTime = clock.get(endTick);
  if (startTime == null || endTime == null || endTime <= startTime) {
    return { error: 'Press Play on Circuit and let the next bar begin after your take. Check Clock Tx if this stays empty.' };
  }
  const intervals: number[] = [];
  for (let tick = startTick; tick < endTick; tick++) {
    const left = clock.get(tick);
    const right = clock.get(tick + 1);
    if (left == null || right == null || right < left) {
      return { error: 'Clock was interrupted. Capture again after a continuous take.' };
    }
    intervals.push(right - left);
  }
  // Clock counts can remain consecutive even when an input drops out.
  const typical = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]!;
  if (intervals.some((duration) => duration > Math.max(100, typical * 6))) {
    return { error: 'Clock was interrupted. Capture again after a continuous take.' };
  }
  const bpm = 240_000 * length / (endTime - startTime);
  if (bpm < 20 || bpm > 400) {
    return { error: 'Circuit clock timing is out of range. Check that only Circuit is sending clock to this input.' };
  }
  const position = (event: RecordedMidiEvent) => {
    const tick = Math.max(startTick, (event.position?.tickCount ?? 0) - 1);
    const left = clock.get(tick);
    const right = clock.get(tick + 1);
    const offset = left != null && right != null && right > left
      ? Math.max(0, Math.min(0.999, (event.atMs - left) / (right - left)))
      : 0;
    return Math.min(span, tick - startTick + offset);
  };
  const lanes = SONG_TRACKS.map((track) => ({ track, length, notes: [] as ClipNote[] }));
  const pending = new Map<string, ClipNote>();
  for (const event of run) {
    if (event.atMs >= endTime) break;
    // Allow a first hit immediately before the first MIDI clock pulse.
    if (event.atMs < startTime && !(startTick === 0 && event.position?.tickCount === 0 &&
      startTime - event.atMs <= (endTime - startTime) / span)) continue;
    if (event.position?.transport !== 'playing') continue;
    if (event.channel == null || event.note == null) continue;
    const lane = lanes[event.channel - 1];
    if (!lane) continue;
    const key = `${event.channel}:${event.note}`;
    const at = position(event);
    const previous = pending.get(key);
    if (previous) previous.end = Math.min(span, Math.max(previous.at + 0.01, at));
    pending.delete(key);
    if (event.kind === 'note-on' && (event.velocity ?? 0) > 0 && at < span) {
      // Bound missing releases to the clip. Real note-offs and retriggers replace this end.
      const note = { at, end: span, pitch: event.note, velocity: event.velocity! };
      lane.notes.push(note);
      pending.set(key, note);
    }
  }
  const clips = lanes.filter((lane) => lane.notes.length > 0);
  if (quantize) {
    const step = TICKS_PER_BAR / 16;
    for (const clip of clips) {
      clip.notes = capRetriggers(clip.notes.map((note) => {
        const at = Math.min(span - step, Math.round(note.at / step) * step);
        return { ...note, at, end: Math.min(span, at + note.end - note.at) };
      }));
    }
  }
  if (!clips.length) return { error: 'No Circuit notes on channels 1–8 in those bars. Check Note Tx and the assigned Circuit MIDI input.' };
  return { bpm: Math.round(bpm * 10) / 10, clips };
}

export function canPlace(clips: readonly SongClip[], candidate: SongClip): boolean {
  return Number.isInteger(candidate.bar) && candidate.bar >= 0 &&
    candidate.bar + candidate.length <= SONG_BARS &&
    clips.every((clip) => clip.id === candidate.id || clip.track !== candidate.track ||
      clip.bar + clip.length <= candidate.bar || candidate.bar + candidate.length <= clip.bar);
}

/** A new hit of the same pitch releases the last one first. */
export function capRetriggers(notes: ClipNote[]): ClipNote[] {
  const previous = new Map<number, ClipNote>();
  for (const note of notes.sort((a, b) => a.at - b.at)) {
    const held = previous.get(note.pitch);
    if (held) held.end = Math.min(held.end, note.at);
    previous.set(note.pitch, note);
  }
  return notes.filter((note) => note.end > note.at);
}

export function sectionClips(
  clips: readonly SongClip[],
  fromBar: number,
  length: ClipLength,
): SongClip[] {
  const span = length * TICKS_PER_BAR;
  return SONG_TRACKS.flatMap((track) => {
    const notes = clips.filter((clip) => clip.track === track).flatMap((clip) => {
      const offset = (clip.bar - fromBar) * TICKS_PER_BAR;
      return clip.notes.flatMap((note) => {
        const at = note.at + offset;
        return at >= 0 && at < span ? [{ ...note, at, end: Math.min(span, note.end + offset) }] : [];
      });
    });
    return notes.length ? [{ id: `section-${fromBar}-${track}`, track, bar: fromBar, length, notes }] : [];
  });
}

export function songEvents(clips: readonly SongClip[], fromBar: number): SongEvent[] {
  return clips.flatMap((clip) =>
    clip.notes.flatMap((note) => {
      const offset = (clip.bar - fromBar) * TICKS_PER_BAR;
      if (offset + note.at < 0) return [];
      return [
        { tick: offset + note.at, track: clip.track, pitch: note.pitch, velocity: note.velocity },
        { tick: offset + note.end, track: clip.track, pitch: note.pitch, velocity: 0 },
      ];
    }),
  ).sort((a, b) => a.tick - b.tick || Number(a.velocity > 0) - Number(b.velocity > 0));
}

export function loadSong(storage: Pick<Storage, 'getItem'>): Song {
  const empty = { bpm: 120, clips: [] };
  try {
    const saved: Song | null = JSON.parse(storage.getItem(SONG_STORAGE_KEY) ?? 'null');
    if (!saved || !Number.isFinite(saved.bpm) || saved.bpm < 20 || saved.bpm > 400 ||
        !Array.isArray(saved.clips)) return empty;
    const clips: SongClip[] = [];
    for (const clip of saved.clips) {
      if (!clip || typeof clip.id !== 'string' || clips.some((other) => other.id === clip.id) ||
        !SONG_TRACKS.some((track) => track === clip.track) || !CLIP_LENGTHS.includes(clip.length) ||
        !canPlace(clips, clip) || !Array.isArray(clip.notes) || !clip.notes.length) continue;
      const notes = clip.notes.filter((note) => note && Number.isFinite(note.at) &&
        note.at >= 0 && Number.isFinite(note.end) && note.end > note.at &&
        note.end <= clip.length * TICKS_PER_BAR && Number.isInteger(note.pitch) &&
        note.pitch >= 0 && note.pitch <= 127 && Number.isInteger(note.velocity) &&
        note.velocity >= 1 && note.velocity <= 127);
      if (notes.length) clips.push({ ...clip, notes });
    }
    const mutedTracks = Array.isArray(saved.mutedTracks)
      ? SONG_TRACKS.filter((track) => saved.mutedTracks!.includes(track))
      : [];
    return { bpm: saved.bpm, clips, mutedTracks };
  } catch {
    return empty;
  }
}
