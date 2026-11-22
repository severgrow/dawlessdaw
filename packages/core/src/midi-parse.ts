import type { MidiMessage, MidiMessageKind, PortId } from './types';

export function parseMidiMessage(
  data: Uint8Array,
  timestamp: number,
  portId: PortId,
): MidiMessage {
  if (data.length === 0) {
    return { data, timestamp, portId, kind: 'unknown' };
  }

  const status = data[0]!;

  if (status === 0xf8) return { data, timestamp, portId, kind: 'clock' };
  if (status === 0xfa) return { data, timestamp, portId, kind: 'start' };
  if (status === 0xfb) return { data, timestamp, portId, kind: 'continue' };
  if (status === 0xfc) return { data, timestamp, portId, kind: 'stop' };
  if (status === 0xf2) return { data, timestamp, portId, kind: 'song-position' };
  if (status === 0xf0) return { data, timestamp, portId, kind: 'sysex' };

  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  switch (type) {
    case 0x80:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'note-off',
        note: data[1],
        velocity: data[2],
      };
    case 0x90: {
      const velocity = data[2] ?? 0;
      const kind: MidiMessageKind = velocity === 0 ? 'note-off' : 'note-on';
      return {
        data,
        timestamp,
        portId,
        channel,
        kind,
        note: data[1],
        velocity,
      };
    }
    case 0xa0:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'aftertouch',
        note: data[1],
        value: data[2],
      };
    case 0xb0:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'cc',
        controller: data[1],
        value: data[2],
      };
    case 0xc0:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'program-change',
        value: data[1],
      };
    case 0xd0:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'aftertouch',
        value: data[1],
      };
    case 0xe0:
      return {
        data,
        timestamp,
        portId,
        channel,
        kind: 'pitch-bend',
        value: (data[1] ?? 0) | ((data[2] ?? 0) << 7),
      };
    default:
      return { data, timestamp, portId, kind: 'unknown' };
  }
}

export function isClockLike(kind: MidiMessageKind): boolean {
  return (
    kind === 'clock' ||
    kind === 'start' ||
    kind === 'stop' ||
    kind === 'continue' ||
    kind === 'song-position'
  );
}

export function buildNoteOn(channel: number, note: number, velocity: number): Uint8Array {
  return new Uint8Array([0x90 | ((channel - 1) & 0x0f), note & 0x7f, velocity & 0x7f]);
}

export function buildNoteOff(channel: number, note: number, velocity = 0): Uint8Array {
  return new Uint8Array([0x80 | ((channel - 1) & 0x0f), note & 0x7f, velocity & 0x7f]);
}

export function buildCc(channel: number, controller: number, value: number): Uint8Array {
  return new Uint8Array([0xb0 | ((channel - 1) & 0x0f), controller & 0x7f, value & 0x7f]);
}

export function cloneMidiData(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}
