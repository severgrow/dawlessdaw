/**
 * Rolling capture last N bars — buffer bounds + capture window.
 */

import { describe, expect, it } from 'vitest';
import { parseMidiMessage, type MidiMessage, type PortId } from '@dawlessdaw/core';
import {
  CAPTURE_BAR_OPTIONS,
  CAPTURE_CLOCKS_PER_BAR,
  RollingMidiCapture,
  extractLastNBars,
  isClockConfidentForBars,
  type CaptureClockHint,
} from './capture-last-n-bars';
import type { MidiRecorderPosition, RecordedMidiEvent } from './event-recorder';

function msg(data: number[], opts: { at?: number; portId?: PortId } = {}): MidiMessage {
  return parseMidiMessage(new Uint8Array(data), opts.at ?? 0, opts.portId ?? 'in');
}

function pos(tick: number, bar = 1, beat = 1): MidiRecorderPosition {
  return { bar, beat, tickCount: tick, transport: 'playing' };
}

function confident(position: MidiRecorderPosition | null, bpm = 120): CaptureClockHint {
  return {
    confidence: 'High',
    status: 'STABLE',
    bpm,
    clockDetected: true,
    position,
  };
}

describe('isClockConfidentForBars', () => {
  it('requires High + detected + bpm', () => {
    expect(
      isClockConfidentForBars({
        confidence: 'High',
        bpm: 120,
        clockDetected: true,
      }),
    ).toBe(true);
    expect(
      isClockConfidentForBars({
        confidence: 'Medium',
        bpm: 120,
        clockDetected: true,
      }),
    ).toBe(false);
    expect(
      isClockConfidentForBars({
        confidence: 'High',
        bpm: null,
        clockDetected: true,
      }),
    ).toBe(false);
  });
});

describe('extractLastNBars', () => {
  it('bar-aligns when clock confident and positions known', () => {
    const end = pos((10 - 1) * CAPTURE_CLOCKS_PER_BAR, 10, 1); // bar 10 start
    const events: RecordedMidiEvent[] = [];
    // notes at bars 7–10; last 2 bars from bar-10 start → ticks cover bars 8–10
    for (const bar of [7, 8, 9, 10]) {
      const tick = (bar - 1) * CAPTURE_CLOCKS_PER_BAR;
      events.push({
        seq: bar,
        atMs: bar * 1000,
        source: { kind: 'incoming', portId: 'circuit-in' },
        kind: 'note-on',
        note: 60,
        velocity: 100,
        data: new Uint8Array([0x90, 60, 100]),
        position: pos(tick, bar, 1),
        transportMeta: null,
      });
    }
    const result = extractLastNBars(events, 2, confident(end), { nowMs: 10_000 });
    expect(result.quality).toBe('bar-aligned');
    expect(result.clock.barAligned).toBe(true);
    expect(result.actualInterval.kind).toBe('bars');
    expect(result.events.map((e) => e.position?.bar)).toEqual([8, 9, 10]);
    expect(result.sources).toEqual([{ kind: 'incoming', portId: 'circuit-in' }]);
    expect(result.limitations).toEqual([]);
  });

  it('uses wall-time and labels honestly when clock not confident', () => {
    const events: RecordedMidiEvent[] = [
      {
        seq: 1,
        atMs: 100,
        source: { kind: 'incoming', portId: 'in' },
        kind: 'cc',
        controller: 1,
        value: 1,
        data: new Uint8Array([0xb0, 1, 1]),
        position: null,
        transportMeta: null,
      },
      {
        seq: 2,
        atMs: 9000,
        source: { kind: 'incoming', portId: 'in' },
        kind: 'cc',
        controller: 1,
        value: 2,
        data: new Uint8Array([0xb0, 1, 2]),
        position: null,
        transportMeta: null,
      },
    ];
    const result = extractLastNBars(
      events,
      1,
      { confidence: 'Unknown', bpm: null, clockDetected: false, position: null },
      { nowMs: 10_000 },
    );
    // 1 bar @ assumed 120 → 2000 ms window [8000, 10000]
    expect(result.quality).toBe('approximate');
    expect(result.clock.barAligned).toBe(false);
    expect(result.actualInterval.kind).toBe('wall-ms');
    expect(result.events).toHaveLength(1);
    expect(result.limitations.some((l) => /not bar-aligned/i.test(l))).toBe(true);
    expect(result.limitations.some((l) => /120/i.test(l))).toBe(true);
  });

  it('reports empty when no events in window', () => {
    const end = pos(CAPTURE_CLOCKS_PER_BAR * 4);
    const result = extractLastNBars([], 4, confident(end), { nowMs: 1000 });
    expect(result.quality).toBe('empty');
    expect(result.events).toHaveLength(0);
  });

  it('marks truncated when buffer starts after window start', () => {
    const end = pos(CAPTURE_CLOCKS_PER_BAR * 20);
    const events: RecordedMidiEvent[] = [
      {
        seq: 1,
        atMs: 5000,
        source: { kind: 'outbound', portId: 'sp-out' },
        kind: 'note-on',
        note: 40,
        velocity: 80,
        data: new Uint8Array([0x90, 40, 80]),
        position: pos(CAPTURE_CLOCKS_PER_BAR * 18, 19, 1),
        transportMeta: null,
      },
    ];
    const result = extractLastNBars(events, 8, confident(end), {
      nowMs: 6000,
      droppedFromRing: 50,
    });
    expect(result.quality).toBe('truncated');
    expect(result.limitations.some((l) => /dropped|aged out|truncated/i.test(l))).toBe(true);
  });
});

describe('RollingMidiCapture', () => {
  it('supports CAPTURE_BAR_OPTIONS including 8', () => {
    expect(CAPTURE_BAR_OPTIONS).toEqual([1, 2, 4, 8, 16]);
  });

  it('bounds by event capacity', () => {
    let tick = 0;
    const roll = new RollingMidiCapture({
      eventCapacity: 3,
      getPosition: () => pos(tick),
    });
    roll.start();
    for (let i = 0; i < 5; i++) {
      tick = i * 10;
      roll.observeIncoming(msg([0x90, 40 + i, 90], { at: i }));
    }
    expect(roll.getRecorder().size()).toBe(3);
    expect(roll.getRecorder().getDropped()).toBe(2);
  });

  it('bounds by maxBytes', () => {
    const roll = new RollingMidiCapture({
      eventCapacity: 1000,
      maxBytes: 200, // tiny — forces byte drops
    });
    roll.start();
    for (let i = 0; i < 40; i++) {
      roll.observeIncoming(msg([0xb0, 1, i % 127], { at: i }));
    }
    expect(roll.getApproxBytes()).toBeLessThanOrEqual(200);
    expect(roll.getByteDropped()).toBeGreaterThan(0);
    expect(roll.getRecorder().size()).toBeGreaterThan(0);
  });

  it('capture window returns ordered events with source ids', () => {
    let tick = 0;
    const roll = new RollingMidiCapture({
      getPosition: () => pos(tick, Math.floor(tick / CAPTURE_CLOCKS_PER_BAR) + 1, 1),
      now: () => 50_000,
    });
    roll.start();
    for (let bar = 1; bar <= 10; bar++) {
      tick = (bar - 1) * CAPTURE_CLOCKS_PER_BAR;
      roll.observeIncoming(msg([0x90, 60, 100], { at: bar * 1000, portId: 'circuit-in' }));
      roll.observeOutbound(msg([0x90, 60, 100], { at: bar * 1000 + 1, portId: 'sp-out' }), {
        routeId: 'r1',
        portId: 'sp-out',
      });
    }
    tick = 9 * CAPTURE_CLOCKS_PER_BAR;
    const cap = roll.captureLastBars(2, confident(pos(tick, 10, 1)));
    expect(cap.quality).toBe('bar-aligned');
    expect(cap.events.length).toBeGreaterThan(0);
    // order preserved
    for (let i = 1; i < cap.events.length; i++) {
      expect(cap.events[i]!.seq).toBeGreaterThan(cap.events[i - 1]!.seq);
    }
    const kinds = new Set(cap.sources.map((s) => `${s.kind}:${s.portId}`));
    expect(kinds.has('incoming:circuit-in')).toBe(true);
    expect(kinds.has('outbound:sp-out')).toBe(true);
  });

  it('does not record while stopped', () => {
    const roll = new RollingMidiCapture();
    expect(roll.observeIncoming(msg([0x90, 60, 1]))).toBeNull();
    roll.start();
    expect(roll.observeIncoming(msg([0x90, 60, 1], { at: 1 }))).not.toBeNull();
  });
});
