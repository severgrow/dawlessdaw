import { describe, expect, it } from 'vitest';
import { SequencerEngine } from './engine';
import { activePattern, clonePattern } from './pattern';
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

  it('auditions A without editing B or restarting from incoming transport messages', () => {
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({ onNote: (note) => notes.push(note), persist: false });
    eng.setStep(1, 0, { on: true, pitch: 55, gate: 1 });
    const original = clonePattern(activePattern(eng.getSnapshot().bank));
    eng.setStep(1, 0, { pitch: 58 });
    eng.play();
    eng.onMidiClockMessage('clock', 100);
    expect(notes.map((note) => note.pitch)).toEqual([58]);
    const undoCount = eng.getSnapshot().undoCount;

    expect(eng.setAuditionPattern(original)).toBe(true);
    eng.onMidiClockMessage('start', 110);
    eng.onMidiClockMessage('clock', 200);
    expect(eng.getSnapshot().playing).toBe(false);

    eng.play();
    eng.onMidiClockMessage('clock', 210);
    expect(notes.map((note) => note.pitch)).toEqual([58]);
    eng.onMidiClockMessage('clock', 226);
    expect(notes.map((note) => note.pitch)).toEqual([58, 55]);
    expect(eng.getSnapshot().undoCount).toBe(undoCount);
    expect(activePattern(eng.getSnapshot().bank).tracks[0]!.steps[0]!.pitch).toBe(58);
    eng.setStep(1, 0, { pitch: 60 });
    eng.undo();
    eng.setAuditionPattern(null);
    eng.play();
    eng.onMidiClockMessage('clock', 400);
    expect(notes.map((note) => note.pitch)).toEqual([58, 55, 58]);
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
