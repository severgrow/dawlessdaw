import { describe, expect, it } from 'vitest';
import {
  GenerativeEngine,
  generateWorkingPattern,
  mutateWorkingPattern,
} from './generative';
import { createPattern } from './pattern';
import { pitchClassInScale } from './scale';

function emptyLocks() {
  return Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => false));
}

describe('generative pattern', () => {
  it('keeps source separate from working after generate', () => {
    const eng = new GenerativeEngine();
    const src = createPattern(1);
    src.tracks[0]!.steps[0] = { on: true, pitch: 57, velocity: 100, gate: 0.85 }; // A3
    eng.captureSource(src, 'pattern');
    eng.setSettings({ root: 9, scaleId: 'minor', density: 0.8, seed: 7 });
    eng.generate();
    const snap = eng.getSnapshot();
    expect(snap.hasSource).toBe(true);
    expect(snap.source!.tracks[0]!.steps[0]!.pitch).toBe(57);
    expect(snap.working).not.toEqual(snap.source);
    // Source unchanged after second generate
    eng.generate();
    expect(eng.getSnapshot().source!.tracks[0]!.steps[0]!.pitch).toBe(57);
  });

  it('respects locks on generate and mutate', () => {
    const base = createPattern(1);
    base.tracks[0]!.steps[0] = { on: true, pitch: 60, velocity: 100, gate: 0.85 };
    const locks = emptyLocks();
    locks[0]![0] = true;
    const settings = {
      root: 0,
      scaleId: 'major' as const,
      density: 1,
      mutation: 1,
      seed: 3,
    };
    const gen = generateWorkingPattern(base, locks, settings);
    expect(gen.tracks[0]!.steps[0]).toEqual(base.tracks[0]!.steps[0]);

    const mut = mutateWorkingPattern(gen, locks, settings);
    expect(mut.tracks[0]!.steps[0]).toEqual(base.tracks[0]!.steps[0]);
  });

  it('generated on-pitches stay in scale', () => {
    const base = createPattern(1);
    const locks = emptyLocks();
    const settings = {
      root: 9,
      scaleId: 'minor' as const,
      density: 1,
      mutation: 0,
      seed: 11,
    };
    const gen = generateWorkingPattern(base, locks, settings);
    for (const track of gen.tracks) {
      for (let s = 0; s < gen.length; s++) {
        const st = track.steps[s]!;
        if (!st.on) continue;
        expect(pitchClassInScale(st.pitch, 9, 'minor')).toBe(true);
      }
    }
  });

  it('undo restores previous working', () => {
    const eng = new GenerativeEngine();
    eng.captureSource(createPattern(1), 'blank');
    eng.setSettings({ density: 0.9, seed: 1 });
    eng.generate();
    const afterGen = eng.getSnapshot().working.tracks[0]!.steps.map((s) => s.on);
    eng.setSettings({ seed: 2 });
    eng.generate();
    expect(eng.getSnapshot().undoCount).toBeGreaterThanOrEqual(1);
    eng.undo();
    expect(eng.getSnapshot().working.tracks[0]!.steps.map((s) => s.on)).toEqual(afterGen);
  });

  it('one-note edit quantizes to scale and is undoable', () => {
    const eng = new GenerativeEngine();
    eng.captureSource(createPattern(1), 'pattern');
    eng.setSettings({ root: 0, scaleId: 'major' });
    eng.editStep(1, 0, { on: true, pitch: 61 }); // C# → C
    expect(eng.getSnapshot().working.tracks[0]!.steps[0]).toMatchObject({
      on: true,
      pitch: 60,
    });
    eng.undo();
    expect(eng.getSnapshot().working.tracks[0]!.steps[0]!.on).toBe(false);
  });

  it('resetToSource restores unlocked cells only', () => {
    const eng = new GenerativeEngine();
    const src = createPattern(1);
    src.tracks[0]!.steps[0] = { on: true, pitch: 57, velocity: 90, gate: 0.85 };
    src.tracks[0]!.steps[1] = { on: true, pitch: 60, velocity: 90, gate: 0.85 };
    eng.captureSource(src, 'mirror');
    eng.setLock(1, 0, true);
    eng.setSettings({ density: 0, seed: 5 }); // clear unlocked
    eng.generate();
    expect(eng.getSnapshot().working.tracks[0]!.steps[0]!.on).toBe(true); // locked
    expect(eng.getSnapshot().working.tracks[0]!.steps[1]!.on).toBe(false);
    // Edit locked cell away, then reset — locked stays edited, unlocked returns
    eng.editStep(1, 0, { pitch: 64 });
    eng.resetToSource();
    const snap = eng.getSnapshot();
    expect(snap.working.tracks[0]!.steps[0]!.pitch).toBe(64); // lock preserved edit
    expect(snap.working.tracks[0]!.steps[1]).toMatchObject({ on: true, pitch: 60 });
  });

  it('same seed → same generate', () => {
    const base = createPattern(1);
    const locks = emptyLocks();
    const settings = {
      root: 2,
      scaleId: 'dorian' as const,
      density: 0.5,
      mutation: 0.3,
      seed: 12345,
    };
    const a = generateWorkingPattern(base, locks, settings);
    const b = generateWorkingPattern(base, locks, settings);
    expect(a).toEqual(b);
  });
});
