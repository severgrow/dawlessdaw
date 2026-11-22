import { describe, it, expect, vi } from 'vitest';
import {
  applyHandoffMutes,
  DEFAULT_HANDOFF,
  restoreHandoffMutes,
  sanitizeHandoff,
  sanitizeHandoffTracks,
  toggleHandoffTrack,
} from './handoff';

describe('FLIP handoff', () => {
  it('sanitizes tracks to unique 1–8', () => {
    expect(sanitizeHandoffTracks([1, 1, 9, 0, 3, '2'])).toEqual([1, 2, 3]);
    expect(sanitizeHandoffTracks([])).toEqual([...DEFAULT_HANDOFF.tracks]);
    expect(sanitizeHandoffTracks(null)).toEqual([...DEFAULT_HANDOFF.tracks]);
  });

  it('sanitizes handoff prefs', () => {
    expect(sanitizeHandoff({ replaceMidiWhilePlaying: true, tracks: [2, 4] })).toEqual({
      replaceMidiWhilePlaying: true,
      tracks: [2, 4],
    });
    expect(sanitizeHandoff(undefined).replaceMidiWhilePlaying).toBe(false);
  });

  it('applies mutes only to unmuted selected tracks and restores', () => {
    const state: Record<number, boolean> = { 1: false, 2: true, 3: false };
    const setMute = vi.fn((track: number, muted: boolean) => {
      state[track] = muted;
    });
    const snap = applyHandoffMutes(
      [1, 2, 3],
      (t) => state[t] === true,
      setMute,
    );
    expect(snap).toEqual([
      { track: 1, wasMuted: false },
      { track: 2, wasMuted: true },
      { track: 3, wasMuted: false },
    ]);
    expect(setMute).toHaveBeenCalledWith(1, true);
    expect(setMute).toHaveBeenCalledWith(3, true);
    expect(setMute).not.toHaveBeenCalledWith(2, true);
    expect(state[1]).toBe(true);
    expect(state[2]).toBe(true);
    expect(state[3]).toBe(true);

    restoreHandoffMutes(snap, setMute);
    expect(state[1]).toBe(false);
    expect(state[2]).toBe(true);
    expect(state[3]).toBe(false);
  });

  it('toggles track membership', () => {
    expect(toggleHandoffTrack([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleHandoffTrack([1, 3], 2)).toEqual([1, 2, 3]);
  });
});
