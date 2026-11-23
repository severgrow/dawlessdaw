import { describe, expect, it } from 'vitest';
import { buildNoteOff, buildNoteOn, parseMidiMessage } from '@dawlessdaw/core';
import { MidiEventRecorder, type CaptureClockHint, type MidiRecorderPosition } from '@dawlessdaw/midi';
import { createPattern } from '@dawlessdaw/sequencer';
import { circuitPatternBars } from './circuitPatternCapture';

const positionAt = (tickCount: number): MidiRecorderPosition => ({
  tickCount,
  bar: 1 + Math.floor(tickCount / 96),
  beat: 1 + Math.floor((tickCount % 96) / 24),
  transport: 'playing',
});

describe('Circuit MIDI pattern capture', () => {
  it('selects completed bars from the current transport and derives gates across a boundary', () => {
    let position = positionAt(0);
    const recorder = new MidiEventRecorder({ getPosition: () => position });
    recorder.start();
    const incoming = (data: Uint8Array, tick: number, port = 'circuit') => {
      position = positionAt(tick);
      recorder.recordIncoming(parseMidiMessage(data, recorder.size() * 20, port));
    };
    incoming(buildNoteOn(2, 90, 127), 20);
    incoming(Uint8Array.of(0xfa), 0);
    incoming(buildNoteOn(2, 49, 81), 12);
    incoming(buildNoteOff(2, 49), 15);
    incoming(buildNoteOn(2, 55, 120), 13);
    incoming(buildNoteOn(6, 43, 62), 95);
    incoming(buildNoteOn(6, 43, 0), 99);
    incoming(buildNoteOn(2, 70, 95), 98);
    incoming(buildNoteOn(3, 77, 10), 74, 'other');
    recorder.recordOutbound(parseMidiMessage(buildNoteOn(2, 62, 80), 180, 'circuit'));
    incoming(buildNoteOn(2, 95, 85), 194);

    const clock: CaptureClockHint = { confidence: 'High', bpm: 120, position: positionAt(195) };
    const base = createPattern(1);
    base.tracks[1]!.defaultGate = 0.7;
    const result = circuitPatternBars(recorder.getEvents(), 'circuit', 2, clock, 500, base);
    expect(result.aligned).toBe(true);
    expect(result.bars.map((bar) => [bar.label, bar.notes])).toEqual([['Bar 1', 2], ['Bar 2', 1]]);
    const [first, second] = result.bars;
    expect(first!.pattern.tracks[1]!.steps[2]).toEqual({
      on: true, pitch: 49, velocity: 81, gate: 0.5,
    });
    expect(first!.pattern.tracks[5]!.steps[15]).toEqual({
      on: true, pitch: 43, velocity: 62, gate: 4 / 6,
    });
    expect(first!.collisions).toBe(1);
    expect(second!.pattern.tracks[1]!.steps[0]).toEqual({
      on: true, pitch: 70, velocity: 95, gate: 0.7,
    });
    expect(second!.estimatedGates).toBe(1);
    expect(base.tracks[1]!.steps.every((step) => !step.on)).toBe(true);
  });

  it('labels an unclocked capture as estimated and clamps long notes to one step', () => {
    const recorder = new MidiEventRecorder();
    recorder.start();
    recorder.recordIncoming(parseMidiMessage(buildNoteOn(8, 47, 112), 1400, 'circuit'));
    recorder.recordIncoming(parseMidiMessage(buildNoteOff(8, 47), 1800, 'circuit'));
    const result = circuitPatternBars(
      recorder.getEvents(), 'circuit', 1, { confidence: 'Unknown', bpm: null }, 2000, createPattern(2),
    );
    expect(result.aligned).toBe(false);
    expect(result.bars[0]).toMatchObject({ label: 'Window 1', notes: 1, clippedGates: 1 });
    expect(result.bars[0]!.pattern.tracks[7]!.steps[11]).toMatchObject({ pitch: 47, gate: 1 });
  });
});
