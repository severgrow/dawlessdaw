import { describe, expect, it, vi } from 'vitest';
import { createPattern, toggleStep } from './pattern';
import { CLOCKS_PER_STEP, SeqScheduler } from './scheduler';
import type { SeqScheduledNote } from './types';

describe('SeqScheduler', () => {
  it('fires step 0 on first clock after Start (Circuit mode)', () => {
    const notes: SeqScheduledNote[] = [];
    let pattern = createPattern(1, 120);
    pattern = toggleStep(pattern, 1, 0);
    pattern = toggleStep(pattern, 2, 0);

    const sched = new SeqScheduler({
      now: () => 1000,
      onNote: (n) => notes.push(n),
    });
    sched.setClockSource('circuit');
    sched.setPattern(pattern);
    sched.onTransportStart();

    sched.onClockTick(1000);
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.track).sort()).toEqual([1, 2]);
    expect(notes[0]!.step).toBe(0);

    notes.length = 0;
    pattern = toggleStep(pattern, 1, 1);
    sched.setPattern(pattern);
    for (let i = 0; i < CLOCKS_PER_STEP - 1; i++) sched.onClockTick(1000 + i);
    expect(notes).toHaveLength(0);

    sched.onClockTick(1010);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.step).toBe(1);
    expect(notes[0]!.track).toBe(1);
  });

  it('does not emit on Stop and clears playhead', () => {
    const notes: SeqScheduledNote[] = [];
    let pattern = createPattern(1);
    pattern = toggleStep(pattern, 1, 0);
    const off = vi.fn();
    const sched = new SeqScheduler({
      now: () => 0,
      onNote: (n) => notes.push(n),
      onAllNotesOff: off,
    });
    sched.setClockSource('circuit');
    sched.setPattern(pattern);
    sched.onTransportStart();
    sched.onClockTick(0);
    expect(notes.length).toBe(1);
    sched.onTransportStop();
    expect(off).toHaveBeenCalled();
    notes.length = 0;
    sched.onClockTick(1);
    expect(notes).toHaveLength(0);
  });

  it('internal mode schedules with look-ahead timestamps', () => {
    const notes: SeqScheduledNote[] = [];
    let now = 5000;
    let pattern = createPattern(1, 120);
    pattern = toggleStep(pattern, 1, 0);
    const sched = new SeqScheduler({
      now: () => now,
      onNote: (n) => notes.push(n),
      lookAheadMs: 200,
      intervalMs: 10,
    });
    sched.setClockSource('internal');
    sched.setPattern(pattern);
    sched.playInternal();
    // drive one interval manually via private path: advance time and tick
    now = 5000;
    // @ts-expect-error test private
    sched.internalTick();
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0]!.time).toBeGreaterThanOrEqual(5000);
    sched.stop();
  });

  it('skips muted tracks', () => {
    const notes: SeqScheduledNote[] = [];
    let pattern = createPattern(1);
    pattern = toggleStep(pattern, 1, 0);
    pattern.tracks[0]!.muted = true;
    const sched = new SeqScheduler({
      now: () => 0,
      onNote: (n) => notes.push(n),
    });
    sched.setClockSource('circuit');
    sched.setPattern(pattern);
    sched.onTransportStart();
    sched.onClockTick(0);
    expect(notes).toHaveLength(0);
  });
});
