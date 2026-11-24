import { CAPTURE_PPQN } from '@dawlessdaw/midi';
import { SONG_TRACKS, songEvents, type Song } from './song';

const PPQN = 2400;
const SCALE = PPQN / CAPTURE_PPQN;

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  while (value > 0x7f) {
    value >>>= 7;
    bytes.unshift(0x80 | (value & 0x7f));
  }
  return bytes;
}

function trackChunk(data: number[]): number[] {
  const size = data.length;
  return [0x4d, 0x54, 0x72, 0x6b, size >>> 24, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, ...data];
}

export function songMidi(song: Song): Uint8Array<ArrayBuffer> {
  const tempo = Math.round(60_000_000 / Math.min(400, Math.max(20, song.bpm)));
  const active = song.clips.filter((clip) => !song.mutedTracks?.includes(clip.track));
  const end = active.reduce((tick, clip) => Math.max(tick, (clip.bar + clip.length) * PPQN * 4), 0);
  const tracks = [trackChunk([
    0, 0xff, 0x51, 3, tempo >>> 16, (tempo >>> 8) & 0xff, tempo & 0xff,
    ...vlq(end), 0xff, 0x2f, 0,
  ])];
  for (const lane of SONG_TRACKS) {
    const events = songEvents(active.filter((clip) => clip.track === lane), 0);
    if (!events.length) continue;
    const data = [0, 0xff, 3, 2, 0x54, 0x30 + lane]; // Track name: T1–T8
    let previous = 0;
    for (const event of events) {
      const tick = Math.round(event.tick * SCALE);
      const status = (event.velocity ? 0x90 : 0x80) | (lane - 1);
      data.push(...vlq(tick - previous), status, event.pitch, event.velocity);
      previous = tick;
    }
    data.push(...vlq(end - previous), 0xff, 0x2f, 0);
    tracks.push(trackChunk(data));
  }
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, PPQN >>> 8, PPQN & 0xff,
    ...tracks.flat(),
  ]);
}
