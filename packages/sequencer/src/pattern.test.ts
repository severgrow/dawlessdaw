import { describe, expect, it } from 'vitest';
import {
  audibleTracks,
  createBank,
  createPattern,
  exportBankJson,
  importBankJson,
  sanitizeBank,
  setStepParams,
  toggleStep,
} from './pattern';
import { SEQ_SCHEMA_VERSION, SEQ_TRACK_COUNT } from './types';

describe('sequencer pattern', () => {
  it('creates an 8×16 Dawlessdaw bank', () => {
    const bank = createBank(128);
    expect(bank.schemaVersion).toBe(SEQ_SCHEMA_VERSION);
    expect(bank.patterns).toHaveLength(8);
    expect(bank.clockSource).toBe('circuit');
    const p = bank.patterns[0]!;
    expect(p.tracks).toHaveLength(SEQ_TRACK_COUNT);
    expect(p.tracks[0]!.steps).toHaveLength(16);
    expect(p.bpm).toBe(128);
    expect(p.name).toMatch(/Dawlessdaw Pattern/);
  });

  it('toggles steps and round-trips JSON', () => {
    let p = createPattern(1);
    p = toggleStep(p, 1, 0);
    expect(p.tracks[0]!.steps[0]!.on).toBe(true);
    p = setStepParams(p, 1, 0, { pitch: 40, velocity: 90, gate: 0.5 });
    expect(p.tracks[0]!.steps[0]).toMatchObject({ pitch: 40, velocity: 90, gate: 0.5 });

    const bank = createBank();
    bank.patterns[0] = p;
    const raw = exportBankJson(bank);
    const back = importBankJson(raw);
    expect(back.ok).toBe(true);
    expect(back.bank!.patterns[0]!.tracks[0]!.steps[0]!.pitch).toBe(40);
  });

  it('rejects wrong schemaVersion', () => {
    expect(sanitizeBank({ schemaVersion: 99, patterns: [] })).toBeNull();
  });

  it('respects mute/solo for audible tracks', () => {
    const p = createPattern(1);
    p.tracks[0]!.solo = true;
    p.tracks[1]!.muted = true;
    const a = audibleTracks(p);
    expect(a[0]).toBe(true);
    expect(a[1]).toBe(false);
    expect(a[2]).toBe(false);
  });
});
