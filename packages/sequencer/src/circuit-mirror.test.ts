/**
 * Circuit Mirror simulated tests A–J (mandatory).
 * No hardware — deterministic clock + note injection.
 */
import { describe, expect, it } from 'vitest';
import {
  CircuitMirrorEngine,
  cellsFromNcsPattern,
  MIRROR_STEP_COUNT,
  MIRROR_TRACK_COUNT,
} from './circuit-mirror';
import { CLOCKS_PER_STEP } from './scheduler';

function advanceSteps(eng: CircuitMirrorEngine, steps: number): void {
  for (let i = 0; i < steps * CLOCKS_PER_STEP; i++) eng.onClock();
}

describe('Circuit Mirror A–J', () => {
  // A — Clock advances playhead by sixteenth (6 clocks)
  it('A: clock ticks advance playhead one step every 6 clocks', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    expect(eng.getSnapshot().playhead).toBe(0);
    for (let i = 0; i < CLOCKS_PER_STEP; i++) eng.onClock();
    expect(eng.getSnapshot().playhead).toBe(1);
    advanceSteps(eng, 2);
    expect(eng.getSnapshot().playhead).toBe(3);
  });

  // B — Note-on on ch1–8 lands on current step
  it('B: note-on on channels 1–8 lights the current step (dim first hit)', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    advanceSteps(eng, 4); // playhead 4
    eng.onNoteOn(1, 60, 100);
    eng.onNoteOn(8, 48, 90);
    const snap = eng.getSnapshot();
    expect(snap.tracks[0]![4]!.kind).toBe('dim');
    expect(snap.tracks[0]![4]!.note).toBe(60);
    expect(snap.tracks[7]![4]!.kind).toBe('dim');
    expect(snap.tracks[7]![4]!.velocity).toBe(90);
  });

  // C — Loop-aware: hit survives cycle; second cycle confirms → bright; miss fades
  it('C: loop-aware — survive cycle as dim, re-hit → bright, miss → empty', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    eng.onNoteOn(1, 60, 100); // step 0 dim + hitThisCycle
    advanceSteps(eng, MIRROR_STEP_COUNT); // end cycle; hit survives → still dim
    expect(eng.getSnapshot().cycle).toBe(1);
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('dim');

    eng.onNoteOn(1, 60, 100); // re-hit → bright
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('bright');

    // Cycle that included the re-hit keeps bright; next empty cycle fades.
    advanceSteps(eng, MIRROR_STEP_COUNT); // hitThisCycle still true → stays bright
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('bright');
    advanceSteps(eng, MIRROR_STEP_COUNT); // no hit → bright→dim
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('dim');
    advanceSteps(eng, MIRROR_STEP_COUNT); // no hit → dim→empty
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('empty');
  });

  // D — Out-of-range / silent notes ignored
  it('D: ignores channel 0/9+ and zero velocity; diagnostic is read-only JSON', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    eng.onNoteOn(0, 60, 100);
    eng.onNoteOn(9, 60, 100);
    eng.onNoteOn(1, 60, 0);
    const snap = eng.getSnapshot();
    expect(snap.tracks.every((row) => row.every((c) => c.kind === 'empty'))).toBe(true);
    const diag = eng.exportDiagnostic();
    expect(diag.feature).toBe('circuit-mirror');
    expect(diag.honesty).toBe('experimental');
  });

  // E — Stop clears playing; playhead -1
  it('E: stop ends playing and freezes playhead to -1', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    advanceSteps(eng, 3);
    eng.onNoteOn(1, 60, 100);
    eng.onTransportStop();
    const snap = eng.getSnapshot();
    expect(snap.playing).toBe(false);
    expect(snap.playhead).toBe(-1);
    expect(snap.tracks[0]![3]!.kind).toBe('dim');
  });

  // F — Continue resumes without reset
  it('F: continue resumes playing without wiping the grid', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    eng.onNoteOn(3, 48, 80);
    eng.onTransportStop();
    eng.onTransportContinue();
    const snap = eng.getSnapshot();
    expect(snap.playing).toBe(true);
    expect(snap.tracks[2]![0]!.kind).toBe('dim');
  });

  // G — Eight tracks simultaneous
  it('G: all eight tracks can light on the same step', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    for (let ch = 1; ch <= MIRROR_TRACK_COUNT; ch++) eng.onNoteOn(ch, 36 + ch, 100);
    const snap = eng.getSnapshot();
    for (let t = 0; t < 8; t++) {
      expect(snap.tracks[t]![0]!.kind).toBe('dim');
    }
  });

  // H — Stable getSnapshot until emit
  it('H: getSnapshot returns the same reference until a state change', () => {
    const eng = new CircuitMirrorEngine();
    const a = eng.getSnapshot();
    const b = eng.getSnapshot();
    expect(a).toBe(b);
    eng.onTransportStart();
    const c = eng.getSnapshot();
    expect(c).not.toBe(a);
    expect(eng.getSnapshot()).toBe(c);
  });

  // I — .ncs Saved helper maps steps to bright cells
  it('I: cellsFromNcsPattern maps on-steps to bright cells (Saved view)', () => {
    const steps = Array.from({ length: 32 }, (_, i) => ({
      on: i === 0 || i === 4,
      note: 60 + i,
      velocity: 100,
    }));
    const cells = cellsFromNcsPattern(steps);
    expect(cells).toHaveLength(16);
    expect(cells[0]!.kind).toBe('bright');
    expect(cells[4]!.kind).toBe('bright');
    expect(cells[1]!.kind).toBe('empty');
  });

  // J — Notes while stopped are ignored (passive; no speculative write)
  it('J: notes while stopped do not write the grid', () => {
    const eng = new CircuitMirrorEngine();
    eng.onNoteOn(1, 60, 100);
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('empty');
    eng.onMidiMessage('start');
    eng.onMidiMessage('note-on', 1, 61, 99);
    expect(eng.getSnapshot().tracks[0]![0]!.kind).toBe('dim');
    eng.onMidiMessage('clock');
    expect(eng.getSnapshot().playhead).toBe(0);
  });
});
