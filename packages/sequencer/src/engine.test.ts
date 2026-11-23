import { describe, expect, it, vi } from 'vitest';
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

  it('plays on Circuit clock only after Splot Play and disarms on Splot Stop', () => {
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({
      onNote: (n) => notes.push(n),
      persist: false,
    });
    eng.clickToggle(3, 0);
    eng.onMidiClockMessage('start', 100);
    eng.onMidiClockMessage('clock', 100);
    expect(notes).toEqual([]);
    expect(eng.getSnapshot().playing).toBe(false);

    eng.play();
    eng.onMidiClockMessage('start', 120);
    eng.onMidiClockMessage('clock', 120);
    expect(notes.map((note) => note.track)).toEqual([3]);
    eng.onMidiClockMessage('stop');
    expect(eng.getSnapshot().playing).toBe(false);

    eng.onMidiClockMessage('start', 1000);
    eng.onMidiClockMessage('clock', 1000);
    expect(notes.map((note) => note.track)).toEqual([3, 3]);

    eng.stop();
    eng.onMidiClockMessage('start', 2000);
    eng.onMidiClockMessage('clock', 2000);
    expect(notes.map((note) => note.track)).toEqual([3, 3]);
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

  it('switches on a four-beat boundary with Circuit clock and uses the latest edit when returning to B', () => {
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({ onNote: (note) => notes.push(note), persist: false });
    eng.setLength(6);
    eng.setStep(1, 0, { on: true, pitch: 55, gate: 1 });
    eng.setStep(1, 3, { on: true, pitch: 55, gate: 1 });
    const original = clonePattern(activePattern(eng.getSnapshot().bank));
    eng.setStep(1, 0, { pitch: 58 });
    eng.play();
    const tick = (i: number) => eng.onMidiClockMessage('clock', i * 20);
    tick(0);
    eng.requestAudition(original);
    expect(eng.getSnapshot()).toMatchObject({ playing: true, auditionSide: 'B', queuedAudition: 'A' });
    for (let i = 1; i < 96; i++) tick(i);
    expect(eng.getSnapshot().auditionSide).toBe('B');
    const last = notes.at(-1)!;
    tick(96);
    expect(eng.getSnapshot()).toMatchObject({ playing: true, auditionSide: 'A', queuedAudition: null });
    expect(notes.at(-1)).toMatchObject({ pitch: 55, step: 0, time: 1920 });
    expect(last.time + last.durationMs).toBeLessThanOrEqual(notes.at(-1)!.time);
    eng.requestAudition(null);
    eng.setStep(1, 0, { pitch: 62 });
    for (let i = 97; i <= 192; i++) tick(i);
    expect(notes.at(-1)).toMatchObject({ pitch: 62, step: 0, time: 3840 });
    expect(eng.getSnapshot()).toMatchObject({ playing: true, auditionSide: 'B', queuedAudition: null });
    eng.dispose();
  });

  it('cancels a pending switch and commits the next request when hardware stops', () => {
    const eng = new SequencerEngine({ onNote: () => {}, persist: false });
    const original = clonePattern(activePattern(eng.getSnapshot().bank));
    eng.play();
    eng.requestAudition(original);
    eng.requestAudition(null);
    expect(eng.getSnapshot().queuedAudition).toBeNull();
    eng.requestAudition(original);
    eng.onMidiClockMessage('stop');
    expect(eng.getSnapshot()).toMatchObject({ playing: false, auditionSide: 'A', queuedAudition: null });
    eng.dispose();
  });

  it('switches at the scheduled bar boundary on internal clock without stopping', () => {
    vi.useFakeTimers();
    const notes: SeqScheduledNote[] = [];
    const eng = new SequencerEngine({ onNote: (note) => notes.push(note), now: () => Date.now(), persist: false });
    try {
      eng.setClockSource('internal');
      eng.setStep(1, 0, { on: true, pitch: 55, gate: 1 });
      const original = clonePattern(activePattern(eng.getSnapshot().bank));
      eng.setStep(1, 0, { pitch: 60 });
      eng.play();
      vi.advanceTimersByTime(100);
      eng.requestAudition(original);
      expect(eng.getSnapshot().queuedAudition).toBe('A');
      vi.advanceTimersByTime(2100);
      expect(notes.map((note) => note.pitch)).toEqual([60, 55]);
      expect(eng.getSnapshot()).toMatchObject({ playing: true, auditionSide: 'A', queuedAudition: null });
    } finally {
      eng.dispose();
      vi.useRealTimers();
    }
  });

  it('records Circuit notes onto the playhead with pattern playback off', () => {
    const onNote = vi.fn();
    const eng = new SequencerEngine({
      onNote,
      persist: false,
    });
    eng.setClockSource('circuit');
    eng.setStep(1, 0, { on: true });
    eng.setRecording(true);
    eng.onMidiClockMessage('start');
    eng.onMidiClockMessage('clock', 0);
    eng.observeCircuitNote(2, 42, 88);
    const step = eng.getSnapshot().bank.patterns[0]!.tracks[1]!.steps[0]!;
    expect(step.on).toBe(true);
    expect(step.pitch).toBe(42);
    expect(step.velocity).toBe(88);
    expect(onNote).not.toHaveBeenCalled();
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
