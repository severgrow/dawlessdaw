/**
 * Minimal FLIP → MIDI handoff: mute selected Dawlessdaw sequencer tracks while
 * the FLIP loop plays, then restore. Does NOT mute Circuit's internal sequencer,
 * does NOT isolate stems from a stereo mix, and does NOT claim hardware mute.
 */

export const FLIP_HANDOFF_TRACKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type FlipHandoffTrack = (typeof FLIP_HANDOFF_TRACKS)[number];

export interface FlipMuteSnapshot {
  track: FlipHandoffTrack;
  wasMuted: boolean;
}

export interface FlipHandoffConfig {
  /** When true, PLAY LOOP mutes selected Dawlessdaw sequencer tracks. */
  replaceMidiWhilePlaying: boolean;
  /** Tracks 1–8 to mute for the duration of FLIP playback. */
  tracks: FlipHandoffTrack[];
}

export const DEFAULT_HANDOFF: FlipHandoffConfig = {
  replaceMidiWhilePlaying: false,
  tracks: [1, 2, 3, 4, 5, 6, 7, 8],
};

export const HANDOFF_LIMITS =
  'Dawlessdaw Pattern mute only — not Circuit internal mute, not stem isolation.';

export const HANDOFF_LIMITS_DETAIL =
  'While PLAY LOOP runs, selected T1–T8 stop sending outbound sequencer notes to Controller destinations. STOP / UNDO MUTES restores prior mute flags. Does not mute Circuit’s internal sequencer, does not isolate a stem from the stereo mix, and does not change hardware mute on Circuit / MPC / SP.';

export function isFlipHandoffTrack(n: number): n is FlipHandoffTrack {
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

export function sanitizeHandoffTracks(raw: unknown): FlipHandoffTrack[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HANDOFF.tracks];
  const out: FlipHandoffTrack[] = [];
  for (const x of raw) {
    const n = Number(x);
    if (isFlipHandoffTrack(n) && !out.includes(n)) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out.length > 0 ? out : [...DEFAULT_HANDOFF.tracks];
}

export function sanitizeHandoff(raw: unknown): FlipHandoffConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HANDOFF, tracks: [...DEFAULT_HANDOFF.tracks] };
  const o = raw as Record<string, unknown>;
  return {
    replaceMidiWhilePlaying: o.replaceMidiWhilePlaying === true,
    tracks: sanitizeHandoffTracks(o.tracks),
  };
}

/**
 * Snapshot mute state for selected tracks, then mute them.
 * Returns the snapshot used for restore / undo.
 */
export function applyHandoffMutes(
  tracks: readonly FlipHandoffTrack[],
  getMuted: (track: FlipHandoffTrack) => boolean,
  setMute: (track: FlipHandoffTrack, muted: boolean) => void,
): FlipMuteSnapshot[] {
  const unique = [...new Set(tracks.filter(isFlipHandoffTrack))].sort((a, b) => a - b);
  const snap: FlipMuteSnapshot[] = unique.map((track) => ({
    track,
    wasMuted: getMuted(track),
  }));
  for (const s of snap) {
    if (!s.wasMuted) setMute(s.track, true);
  }
  return snap;
}

/** Restore mute state from a prior applyHandoffMutes snapshot. */
export function restoreHandoffMutes(
  snapshot: readonly FlipMuteSnapshot[],
  setMute: (track: FlipHandoffTrack, muted: boolean) => void,
): void {
  for (const s of snapshot) {
    if (!isFlipHandoffTrack(s.track)) continue;
    setMute(s.track, s.wasMuted === true);
  }
}

export function toggleHandoffTrack(
  tracks: readonly FlipHandoffTrack[],
  track: FlipHandoffTrack,
): FlipHandoffTrack[] {
  if (!isFlipHandoffTrack(track)) return [...tracks];
  if (tracks.includes(track)) return tracks.filter((t) => t !== track);
  return [...tracks, track].sort((a, b) => a - b);
}
