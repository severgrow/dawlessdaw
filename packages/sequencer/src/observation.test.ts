import { describe, expect, it } from 'vitest';
import { CircuitMirrorEngine } from './circuit-mirror';
import {
  mirrorKindToObservation,
  observationFromMirror,
  patternFromMirror,
  patternFromObservation,
} from './observation';

describe('observation reconstruction', () => {
  it('maps mirror kinds to observed/inferred/empty', () => {
    expect(mirrorKindToObservation('bright')).toBe('observed');
    expect(mirrorKindToObservation('dim')).toBe('inferred');
    expect(mirrorKindToObservation('empty')).toBe('empty');
  });

  it('reconstructs from Mirror without claiming RAM dump', () => {
    const eng = new CircuitMirrorEngine();
    eng.onTransportStart();
    // Land notes on T1 step 0
    eng.onNoteOn(1, 57, 100);
    // Advance one full loop (16 steps × 6 clocks) so confirm → bright next hit
    for (let i = 0; i < 16 * 6; i++) eng.onClock();
    eng.onNoteOn(1, 57, 110);

    const snap = eng.getSnapshot();
    const grid = observationFromMirror(snap);
    expect(grid.honesty).toBe('experimental');
    expect(grid.disclaimer.toLowerCase()).toContain('not circuit pattern ram');
    expect(grid.hasContent).toBe(true);
    expect(grid.tracks[0]![0]!.kind).toBe('observed');
    expect(grid.tracks[0]![0]!.note).toBe(57);
  });

  it('patternFromObservation includes inferred by default', () => {
    const grid = observationFromMirror({
      length: 16,
      tracks: Array.from({ length: 8 }, (_, t) =>
        Array.from({ length: 16 }, (_, s) =>
          t === 0 && s === 2
            ? { kind: 'dim' as const, note: 48, velocity: 80 }
            : { kind: 'empty' as const, note: 60, velocity: 0 },
        ),
      ),
    });
    expect(grid.tracks[0]![2]!.kind).toBe('inferred');
    const pat = patternFromObservation(grid);
    expect(pat.tracks[0]!.steps[2]).toMatchObject({ on: true, pitch: 48, velocity: 80 });

    const observedOnly = patternFromObservation(grid, { includeInferred: false });
    expect(observedOnly.tracks[0]!.steps[2]!.on).toBe(false);
  });

  it('patternFromMirror convenience', () => {
    const pat = patternFromMirror({
      length: 8,
      tracks: Array.from({ length: 8 }, () =>
        Array.from({ length: 16 }, (_, s) =>
          s === 0
            ? { kind: 'bright' as const, note: 36, velocity: 100 }
            : { kind: 'empty' as const, note: 60, velocity: 0 },
        ),
      ),
    });
    expect(pat.length).toBe(8);
    expect(pat.tracks[0]!.steps[0]!.on).toBe(true);
  });
});
