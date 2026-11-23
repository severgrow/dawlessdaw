import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_OUT_FORBIDDEN,
  CircuitEchoGuard,
  circuitChannelForTrack,
  planCircuitStepNotes,
} from './circuit-midi-out';
import { createPattern } from './pattern';

describe('circuit MIDI out', () => {
  it('maps tracks 1–8 to documented channels', () => {
    expect(circuitChannelForTrack(1)).toBe(1);
    expect(circuitChannelForTrack(8)).toBe(8);
    expect(circuitChannelForTrack(0)).toBeNull();
    expect(circuitChannelForTrack(9)).toBeNull();
  });

  it('plans note-ons for audible steps only', () => {
    const p = createPattern(1);
    p.tracks[0]!.steps[0] = { on: true, pitch: 36, velocity: 100, gate: 0.5 };
    p.tracks[1]!.steps[0] = { on: true, pitch: 38, velocity: 90, gate: 0.85 };
    p.tracks[1]!.muted = true;
    const notes = planCircuitStepNotes(p, 0, { stepDurationMs: 200 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ track: 1, channel: 1, note: 36, velocity: 100 });
    expect(notes[0]!.durationMs).toBe(100); // gate 0.5 × 200
  });

  it('echo guard suppresses matching Circuit-in feedback', () => {
    let now = 1000;
    const guard = new CircuitEchoGuard({ windowMs: 50, now: () => now });
    guard.recordOutbound(3, 48);
    expect(guard.shouldSuppressIncoming(3, 48)).toBe(true);
    // Consumed — second hit is real performance
    expect(guard.shouldSuppressIncoming(3, 48)).toBe(false);

    guard.recordOutbound(1, 36);
    now += 100; // past window
    expect(guard.shouldSuppressIncoming(1, 36)).toBe(false);
  });

  it('forbids SysEx / invented buttons / second clock / RAM write claims', () => {
    expect(CIRCUIT_OUT_FORBIDDEN.sysex).toBe(true);
    expect(CIRCUIT_OUT_FORBIDDEN.inventedButtonMidi).toBe(true);
    expect(CIRCUIT_OUT_FORBIDDEN.secondClockMaster).toBe(true);
    expect(CIRCUIT_OUT_FORBIDDEN.patternRamWrite).toBe(true);
    expect(CIRCUIT_OUT_FORBIDDEN.guidedRecordClaim).toBe(true);
  });

  it('does not plan clock or SysEx bytes — notes only', () => {
    const p = createPattern(1);
    p.tracks[0]!.steps[0] = { on: true, pitch: 40, velocity: 80, gate: 1 };
    const notes = planCircuitStepNotes(p, 0);
    for (const n of notes) {
      expect(n.channel).toBeGreaterThanOrEqual(1);
      expect(n.channel).toBeLessThanOrEqual(8);
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
    }
  });
});
