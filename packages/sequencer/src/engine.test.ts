import { describe, expect, it } from 'vitest';
import { SequencerEngine } from './engine';
import type { SeqScheduledNote } from './types';

describe('SequencerEngine', () => {
  it('undo/redo restores step toggles', () => {
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({
      onNote: (n) => notes.push(n),
      persist: false,
    });
    eng.clickToggle(1, 0);
    expect(eng.getSnapshot().bank.patterns[0]!.tracks[0]!.steps[0]!.on).toBe(true);
    expect(eng.getSnapshot().undoCount).toBe(1);
    eng.undo();
    expect(eng.getSnapshot().bank.patterns[0]!.tracks[0]!.steps[0]!.on).toBe(false);
    eng.redo();
    expect(eng.getSnapshot().bank.patterns[0]!.tracks[0]!.steps[0]!.on).toBe(true);
    eng.dispose();
  });

  it('follows Circuit start/clock/stop without a second clock', () => {
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({
      onNote: (n) => notes.push(n),
      persist: false,
    });
    eng.setClockSource('circuit');
    eng.clickToggle(3, 0);
    eng.onMidiClockMessage('start', 100);
    eng.onMidiClockMessage('clock', 100);
    expect(notes.some((n) => n.track === 3)).toBe(true);
    eng.onMidiClockMessage('stop');
    expect(eng.getSnapshot().playing).toBe(false);
    eng.dispose();
  });

  it('records observed Circuit notes onto the playhead step', () => {
    const eng = new SequencerEngine({
      onNote: () => {},
      persist: false,
    });
    eng.setClockSource('circuit');
    eng.setRecording(true);
    eng.onMidiClockMessage('start');
    eng.onMidiClockMessage('clock', 0);
    eng.observeCircuitNote(2, 42, 88);
    const step = eng.getSnapshot().bank.patterns[0]!.tracks[1]!.steps[0]!;
    expect(step.on).toBe(true);
    expect(step.pitch).toBe(42);
    expect(step.velocity).toBe(88);
    eng.dispose();
  });

  it('pattern length clamps playback window', () => {
    const eng = new SequencerEngine({
      onNote: () => {},
      persist: false,
    });
    eng.setLength(4);
    expect(eng.getSnapshot().bank.patterns[0]!.length).toBe(4);
    eng.setLength(99);
    expect(eng.getSnapshot().bank.patterns[0]!.length).toBe(16);
    eng.dispose();
  });
});
