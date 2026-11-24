import { canPlace, SONG_BARS, type ClipLength, type Song, type SongClip, type SongPart } from './song';

type SongChange = { song: Song; clips: SongClip[] } | { error: string };

export function partFromTake(song: Song, length: ClipLength, name: string): SongPart {
  return {
    id: crypto.randomUUID(), name: name.trim().slice(0, 40), bpm: song.bpm, length,
    lanes: song.clips.map(({ track, notes }) => ({ track, notes })),
  };
}

export function partClips(part: SongPart, bar: number, linked: boolean): SongClip[] {
  return part.lanes.map((lane) => ({
    ...lane, bar, length: part.length, id: crypto.randomUUID(), title: part.name,
    ...(linked ? { partId: part.id } : {}),
  }));
}

export function placementError(existing: readonly SongClip[], clips: readonly SongClip[]): string | null {
  const blocked = clips.find((clip) => !canPlace(existing, clip));
  if (!blocked) return null;
  if (!Number.isInteger(blocked.bar) || blocked.bar < 0 || blocked.bar + blocked.length > SONG_BARS) {
    return 'This would extend past the end of Song. Choose an earlier bar.';
  }
  const conflict = existing.find((clip) => clip.track === blocked.track && clip.id !== blocked.id &&
    clip.bar < blocked.bar + blocked.length && blocked.bar < clip.bar + clip.length);
  if (!conflict) return 'Choose a free section.';
  const first = Math.max(conflict.bar, blocked.bar) + 1;
  const last = Math.min(conflict.bar + conflict.length, blocked.bar + blocked.length);
  return `Track ${blocked.track} is occupied at ${first === last ? `bar ${first}` : `bars ${first}–${last}`}. Choose a free section.`;
}

export function placePart(song: Song, part: SongPart, bar: number, linked: boolean): SongChange {
  const clips = partClips(part, bar, linked);
  const error = placementError(song.clips, clips);
  return error ? { error } : {
    clips, song: { ...song, bpm: song.clips.length ? song.bpm : part.bpm, clips: [...song.clips, ...clips] },
  };
}

/** Replace every linked placement together. Copies remain separate clips. */
export function updatePart(song: Song, part: SongPart): SongChange {
  const previous = song.clips.filter((clip) => clip.partId === part.id);
  const existing = song.clips.filter((clip) => clip.partId !== part.id);
  const placements = [...new Set(previous.map((clip) => clip.bar))].sort((a, b) => a - b);
  const clips: SongClip[] = [];
  for (const bar of placements) {
    const replacement = partClips(part, bar, true).map((clip) => ({
      ...clip, id: previous.find((old) => old.bar === bar && old.track === clip.track)?.id ?? clip.id,
    }));
    const error = placementError([...existing, ...clips], replacement);
    if (error) return { error };
    clips.push(...replacement);
  }
  return { clips, song: {
    ...song, clips: [...existing, ...clips], parts: song.parts?.map((current) => current.id === part.id ? part : current),
  } };
}

export function removePart(song: Song, part: SongPart): Song {
  return {
    ...song, parts: song.parts?.filter((item) => item.id !== part.id),
    clips: song.clips.map((clip) => clip.partId === part.id ? { ...clip, partId: undefined } : clip),
  };
}

/** A reproducible accent pattern on one lane, leaving the original groove intact. */
export function accentPart(part: SongPart, track: number): SongPart {
  return {
    ...part,
    id: crypto.randomUUID(),
    name: `${part.name.slice(0, 30)} · Accent`,
    lanes: part.lanes.map((lane) => lane.track !== track ? lane : {
      ...lane,
      notes: [...lane.notes].sort((a, b) => a.at - b.at).map((note, i) => ({
        ...note, velocity: Math.max(1, Math.min(127, note.velocity + (i % 2 === 0 ? 10 : -18))),
      })),
    }),
  };
}
