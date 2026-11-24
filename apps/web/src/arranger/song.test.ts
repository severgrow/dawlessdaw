import { describe, expect, it, vi } from 'vitest';
import { buildNoteOff, buildNoteOn, parseMidiMessage } from '@dawlessdaw/core';
import { buildControllerRoutes, myStudioPreset } from '@dawlessdaw/devices';
import { MidiEventRecorder, MockMidiTransport, type MidiRecorderPosition } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import { canPlace, captureSongClips, loadSong, songEvents, type Song } from './song';
import { SongPlayer } from './songPlayer';

function recordedTake() {
  let tickCount = 0;
  let transport: MidiRecorderPosition['transport'] = 'playing';
  const recorder = new MidiEventRecorder({
    recordClockTicks: true,
    getPosition: () => ({ tickCount, transport, bar: Math.floor(tickCount / 96) + 1, beat: 1 }),
  });
  recorder.start();
  const send = (timestamp: number, bytes: ArrayLike<number>, port = 'circuit') =>
    recorder.recordIncoming(parseMidiMessage(Uint8Array.from(bytes), timestamp, port));
  send(0, [0xfa]);
  for (let tick = 0; tick <= 192; tick++) {
    const at = 20 + tick * 20;
    tickCount = tick + 1;
    send(at, [0xf8]);
    if (tick === 0) {
      send(at + 5, buildNoteOn(1, 36, 100));
      send(at + 8, buildNoteOn(3, 36, 80));
      send(at + 10, buildNoteOn(1, 42, 87));
      send(at + 11, buildNoteOn(1, 99, 127), 'other-port');
      send(at + 12, buildNoteOn(9, 44, 110));
    }
    if (tick === 3) send(at + 10, buildNoteOff(1, 36));
    if (tick === 95) send(at + 2, buildNoteOn(8, 57, 109));
    if (tick === 97) send(at, buildNoteOff(8, 57));
    if (tick === 190) send(at, buildNoteOn(1, 45, 70));
    if (tick === 192) send(at, buildNoteOn(1, 46, 70));
  }
  transport = 'stopped';
  send(3870, [0xfc]);
  send(3880, buildNoteOn(2, 90, 70));
  return recorder.getEvents();
}

describe('Circuit Song clips', () => {
  it('captures completed bars with sub-clock timing, independent lanes, and bounded releases', () => {
    const take = captureSongClips(recordedTake(), 'circuit', 2);
    expect(take).toMatchObject({ bpm: 125 });
    if ('error' in take) throw new Error(take.error);
    expect(take.clips.map(({ track }) => track)).toEqual([1, 3, 8]);
    expect(take.clips[0]!.notes).toEqual([
      { at: 0.25, end: 3.5, pitch: 36, velocity: 100 },
      { at: 0.5, end: 192, pitch: 42, velocity: 87 },
      { at: 190, end: 192, pitch: 45, velocity: 70 },
    ]);
    expect(take.clips[2]!.notes[0]).toMatchObject({ end: 97 });
    const last = captureSongClips(recordedTake(), 'circuit', 1);
    expect(last).toMatchObject({ clips: [{ track: 1, notes: [{ pitch: 45, at: 94 }] }] });
    expect(captureSongClips(recordedTake(), 'circuit', 4)).toHaveProperty('error');
  });

  it('guards against overlapping clips and invalid saved placements', () => {
    const base = { id: 'a', track: 1, bar: 0, length: 2 as const, notes: [{ at: 0, end: 4, pitch: 36, velocity: 100 }] };
    const overlap = { ...base, id: 'b', bar: 1 };
    expect(canPlace([base], overlap)).toBe(false);
    expect(canPlace([base], { ...overlap, track: 2 })).toBe(true);
    expect(canPlace([base], { ...overlap, bar: 31 })).toBe(false);
    const saved = loadSong({ getItem: () => JSON.stringify({ bpm: 118, clips: [base, overlap], mutedTracks: [1, 9] }) });
    expect(saved).toEqual({ bpm: 118, clips: [base], mutedTracks: [1] });
    expect(songEvents([base], 1)).toEqual([]);
  });

  it('replays through distinct MPC channels, ignores live notes during playback and cleans up on stop', async () => {
    vi.useFakeTimers();
    try {
      const ports = { circuitIn: 'circuit', mpcOut: 'scarlett', fm1Out: 'fm1', spOut: 'sp' };
      const transport = new MockMidiTransport();
      await transport.start();
      const routing = new MidiRoutingEngine(transport);
      const player = new SongPlayer(
        (e) => routing.inject(parseMidiMessage(e.velocity
          ? buildNoteOn(e.track, e.pitch, e.velocity) : buildNoteOff(e.track, e.pitch), Date.now(), 'circuit')),
        () => routing.allNotesOff(),
        () => {},
        Date.now,
      );
      routing.start((msg) => player.playingBar == null || msg.portId !== 'circuit' || msg.kind !== 'note-on');
      routing.setRoutes(buildControllerRoutes(myStudioPreset('mpc'), ports));
      const take = captureSongClips(recordedTake(), 'circuit', 2);
      if ('error' in take) throw new Error(take.error);
      const song: Song = { bpm: take.bpm, clips: take.clips.map((clip) => ({ ...clip, id: String(clip.track), bar: 0 })) };
      expect(player.play(song, 0)).toBe(true);
      vi.advanceTimersByTime(12);
      transport.inject('circuit', [0x90, 82, 110]);
      player.stop();
      vi.advanceTimersByTime(5000);
      expect(transport.getSent().filter((msg) => msg.portId === 'scarlett').map((msg) => [...msg.data])).toEqual([
        [0x98, 36, 100],
        [0x9a, 36, 80],
        [0x98, 42, 87],
        [0x88, 36, 0],
        [0x8a, 36, 0],
        [0x88, 42, 0],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports scheduled times and releases active notes instead of bursting after a stall', () => {
    vi.useFakeTimers();
    try {
      let now = 1000;
      const sent = vi.fn();
      const release = vi.fn();
      const changed = vi.fn();
      const player = new SongPlayer(sent, release, changed, () => now);
      player.play({ bpm: 125, clips: [{
        track: 1, bar: 0, id: 'clip', length: 1,
        notes: [
          { at: 0, end: 20, pitch: 36, velocity: 100 },
          { at: 2, end: 5, pitch: 42, velocity: 100 },
        ],
      }] }, 0);
      now = 1043;
      vi.advanceTimersByTime(4);
      expect(sent.mock.calls).toEqual([
        [{ tick: 0, track: 1, pitch: 36, velocity: 100 }, 1000],
        [{ tick: 2, track: 1, pitch: 42, velocity: 100 }, 1040],
      ]);
      now = 1243;
      vi.advanceTimersByTime(4);
      expect(sent).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenLastCalledWith('Song stopped after a playback delay');
      expect(player.playingBar).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

});
