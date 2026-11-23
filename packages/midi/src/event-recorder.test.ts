/**
 * Headless MIDI event recorder — order, timestamps, bounds, source id.
 * Does not touch routing or enable clock forward.
 */

import { describe, expect, it } from 'vitest';
import { parseMidiMessage, type MidiMessage, type PortId } from '@dawlessdaw/core';
import { MidiEventRecorder, type MidiRecorderPosition } from './event-recorder';

function msg(
  data: number[],
  opts: { at?: number; portId?: PortId } = {},
): MidiMessage {
  return parseMidiMessage(
    new Uint8Array(data),
    opts.at ?? 0,
    opts.portId ?? 'mock-in',
  );
}

describe('MidiEventRecorder', () => {
  it('preserves injection order and monotonic seq', () => {
    const rec = new MidiEventRecorder({ capacity: 64, now: () => 1000 });
    rec.start();
    rec.recordIncoming(msg([0x90, 60, 100], { at: 10, portId: 'in-a' }));
    rec.recordIncoming(msg([0x80, 60, 0], { at: 20, portId: 'in-a' }));
    rec.recordIncoming(msg([0xb0, 7, 64], { at: 30, portId: 'in-a' }));
    const events = rec.getEvents();
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.kind)).toEqual(['note-on', 'note-off', 'cc']);
    expect(events.map((e) => e.atMs)).toEqual([10, 20, 30]);
  });

  it('stamps timestamps from the message; falls back to now()', () => {
    let t = 500;
    const rec = new MidiEventRecorder({ now: () => t });
    rec.start();
    rec.recordIncoming(msg([0x90, 48, 80], { at: 42 }));
    const bare = parseMidiMessage(new Uint8Array([0xb0, 1, 2]), Number.NaN, 'in');
    t = 777;
    rec.recordIncoming(bare);
    const events = rec.getEvents();
    expect(events[0]!.atMs).toBe(42);
    expect(events[1]!.atMs).toBe(777);
  });

  it('bounds memory: drops oldest when over capacity', () => {
    const rec = new MidiEventRecorder({ capacity: 3 });
    rec.start();
    for (let i = 0; i < 5; i++) {
      rec.recordIncoming(msg([0x90, 40 + i, 90], { at: i * 10 }));
    }
    expect(rec.size()).toBe(3);
    expect(rec.getDropped()).toBe(2);
    const notes = rec.getEvents().map((e) => e.note);
    expect(notes).toEqual([42, 43, 44]);
  });

  it('tags source id: incoming vs outbound without double-count', () => {
    const rec = new MidiEventRecorder();
    rec.start();
    const note = msg([0x90, 60, 100], { at: 1, portId: 'circuit-in' });
    rec.recordIncoming(note);
    // Same bytes routed out — recorded only via outbound API
    rec.recordOutbound(
      { ...note, portId: 'sp-out', timestamp: 2 },
      { routeId: 'route-circuit-sp', portId: 'sp-out' },
    );
    const events = rec.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.source).toEqual({ kind: 'incoming', portId: 'circuit-in' });
    expect(events[1]!.source).toEqual({
      kind: 'outbound',
      portId: 'sp-out',
      routeId: 'route-circuit-sp',
    });
    // Caller must not also recordIncoming the outbound echo — one of each here
    expect(events.filter((e) => e.source.kind === 'incoming')).toHaveLength(1);
    expect(events.filter((e) => e.source.kind === 'outbound')).toHaveLength(1);
  });

  it('records PC, pitch bend, pressure, and transport metadata', () => {
    const rec = new MidiEventRecorder();
    rec.start();
    rec.recordIncoming(msg([0xc0, 12], { at: 1 })); // PC
    rec.recordIncoming(msg([0xe0, 0x00, 0x40], { at: 2 })); // pitch bend
    rec.recordIncoming(msg([0xd0, 40], { at: 3 })); // channel pressure
    rec.recordIncoming(msg([0xa0, 60, 50], { at: 4 })); // poly aftertouch
    rec.recordIncoming(msg([0xfa], { at: 5 })); // start
    rec.recordIncoming(msg([0xfb], { at: 6 })); // continue
    rec.recordIncoming(msg([0xfc], { at: 7 })); // stop
    const kinds = rec.getEvents().map((e) => e.kind);
    expect(kinds).toEqual([
      'program-change',
      'pitch-bend',
      'aftertouch',
      'aftertouch',
      'start',
      'continue',
      'stop',
    ]);
    expect(rec.getEvents().map((e) => e.transportMeta)).toEqual([
      null,
      null,
      null,
      null,
      'start',
      'continue',
      'stop',
    ]);
  });

  it('skips raw clock ticks by default; opt-in via recordClockTicks', () => {
    const off = new MidiEventRecorder();
    off.start();
    off.recordIncoming(msg([0xf8], { at: 1 }));
    off.recordIncoming(msg([0xfa], { at: 2 }));
    expect(off.getEvents().map((e) => e.kind)).toEqual(['start']);

    const on = new MidiEventRecorder({ recordClockTicks: true });
    on.start();
    on.recordIncoming(msg([0xf8], { at: 1 }));
    expect(on.getEvents()[0]!.transportMeta).toBe('clock');
  });

  it('attaches musical position when clock known; null otherwise', () => {
    let pos: MidiRecorderPosition | null = null;
    const rec = new MidiEventRecorder({ getPosition: () => pos });
    rec.start();
    rec.recordIncoming(msg([0x90, 60, 1], { at: 1 }));
    expect(rec.getEvents()[0]!.position).toBeNull();

    pos = { bar: 2, beat: 3, tickCount: 120, transport: 'playing' };
    rec.recordIncoming(msg([0x80, 60, 0], { at: 2 }));
    expect(rec.getEvents()[1]!.position).toEqual(pos);
  });

  it('ignores pushes while stopped; clear resets buffer', () => {
    const rec = new MidiEventRecorder();
    expect(rec.recordIncoming(msg([0x90, 60, 1]))).toBeNull();
    rec.start();
    rec.recordIncoming(msg([0x90, 60, 1], { at: 1 }));
    rec.stop();
    expect(rec.recordIncoming(msg([0x80, 60, 0], { at: 2 }))).toBeNull();
    expect(rec.size()).toBe(1);
    rec.clear();
    expect(rec.size()).toBe(0);
    expect(rec.getDropped()).toBe(0);
  });

  it('does not send MIDI or mutate the input message bytes', () => {
    const rec = new MidiEventRecorder();
    rec.start();
    const data = new Uint8Array([0x90, 60, 100]);
    const m = parseMidiMessage(data, 10, 'in');
    rec.recordIncoming(m);
    data[2] = 1; // mutate original buffer
    expect(rec.getEvents()[0]!.data[2]).toBe(100);
  });

  it('snapshot marks experimental honesty and capacity', () => {
    const rec = new MidiEventRecorder({ capacity: 8 });
    rec.start();
    rec.recordIncoming(msg([0xb0, 1, 2], { at: 1 }));
    const snap = rec.getSnapshot();
    expect(snap.honesty).toBe('experimental');
    expect(snap.recording).toBe(true);
    expect(snap.capacity).toBe(8);
    expect(snap.size).toBe(1);
  });
});
