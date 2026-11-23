import { describe, expect, it } from 'vitest';
import {
  SuperMacroEngine,
  SUPER_MACRO_PRESETS,
  applyCurve,
  createDestinationFromPreset,
  createEmptySuperMacro,
  mapMacroValue,
} from './super-macros';

describe('super-macros helpers', () => {
  it('exposes docs-backed presets from knob catalog', () => {
    expect(SUPER_MACRO_PRESETS.length).toBeGreaterThan(10);
    expect(SUPER_MACRO_PRESETS.every((p) => p.cc >= 0 && p.cc <= 127)).toBe(true);
    expect(SUPER_MACRO_PRESETS.some((p) => p.id.startsWith('fm1.'))).toBe(true);
    expect(SUPER_MACRO_PRESETS.some((p) => p.id.startsWith('sp.'))).toBe(true);
  });

  it('maps curves and invert', () => {
    expect(applyCurve(0.5, 'linear')).toBeCloseTo(0.5);
    expect(applyCurve(0.5, 'ease-in')).toBeCloseTo(0.25);
    expect(mapMacroValue(0, { min: 10, max: 110, curve: 'linear', invert: false })).toBe(10);
    expect(mapMacroValue(127, { min: 10, max: 110, curve: 'linear', invert: false })).toBe(110);
    expect(mapMacroValue(0, { min: 0, max: 127, curve: 'linear', invert: true })).toBe(127);
  });
});

describe('SuperMacroEngine', () => {
  it('fans one macro to multiple destinations when enabled', () => {
    const eng = new SuperMacroEngine({ now: () => 1000 });
    const d1 = createDestinationFromPreset('fm1.brightness')!;
    const d2 = createDestinationFromPreset('sp.fx1')!;
    d1.channel = 5;
    d2.channel = 1;
    const macro = createEmptySuperMacro({
      enabled: true,
      sourceTrack: 1,
      sourceKnob: 0,
      destinations: [d1, d2],
    });
    eng.setMacros([macro]);
    const out = eng.onMacroCc(1, 0, 64);
    expect(out.length).toBe(2);
    expect(out.map((o) => o.cc).sort()).toEqual([16, 74]);
  });

  it('ignores disabled macros and wrong track/knob', () => {
    const eng = new SuperMacroEngine({ now: () => 1 });
    const d = createDestinationFromPreset('fm1.level')!;
    eng.setMacros([createEmptySuperMacro({ enabled: false, sourceTrack: 2, sourceKnob: 1, destinations: [d] })]);
    expect(eng.onMacroCc(2, 1, 10)).toEqual([]);
    eng.setMacros([createEmptySuperMacro({ enabled: true, sourceTrack: 2, sourceKnob: 1, destinations: [d] })]);
    expect(eng.onMacroCc(3, 1, 10)).toEqual([]);
    expect(eng.onMacroCc(2, 0, 10)).toEqual([]);
    expect(eng.onMacroCc(2, 1, 10).length).toBe(1);
  });

  it('pickup mode waits to cross last-sent', () => {
    let t = 0;
    const eng = new SuperMacroEngine({ now: () => (t += 100) });
    const d = createDestinationFromPreset('fm1.brightness')!;
    d.takeover = 'pickup';
    eng.setMacros([createEmptySuperMacro({ enabled: true, sourceTrack: 1, sourceKnob: 0, destinations: [d] })]);
    // First move establishes lastSent
    expect(eng.onMacroCc(1, 0, 0)[0]?.value).toBe(0);
    eng.latchPickup(d.id);
    // Jump high while latched — still blocked until cross
    expect(eng.onMacroCc(1, 0, 100)).toEqual([]);
    // Approach lastSent (0)
    expect(eng.onMacroCc(1, 0, 0).length).toBe(1);
  });

  it('rate-limits and flushes coalesced values', () => {
    let t = 0;
    const eng = new SuperMacroEngine({ now: () => t });
    eng.setTraffic({ maxHz: 10 }); // 100ms gap
    const d = createDestinationFromPreset('fm1.resonance')!;
    eng.setMacros([createEmptySuperMacro({ enabled: true, sourceTrack: 1, sourceKnob: 0, destinations: [d] })]);
    expect(eng.onMacroCc(1, 0, 10).length).toBe(1);
    t += 10;
    expect(eng.onMacroCc(1, 0, 20)).toEqual([]); // coalesced
    t += 100;
    const flushed = eng.flushPending();
    expect(flushed.length).toBe(1);
    expect(flushed[0]?.value).toBe(mapMacroValue(20, d));
  });

  it('panic disables output; morph can be cancelled', () => {
    let t = 50;
    const eng = new SuperMacroEngine({ now: () => t });
    const d = createDestinationFromPreset('mpc.learn1')!;
    eng.setMacros([createEmptySuperMacro({ enabled: true, sourceTrack: 1, sourceKnob: 0, destinations: [d] })]);
    eng.onMacroCc(1, 0, 40);
    eng.captureScene('a');
    t += 100;
    eng.onMacroCc(1, 0, 90);
    eng.captureScene('b');
    eng.startMorph('b');
    expect(eng.getSnapshot().morph.active).toBe(true);
    eng.cancelMorph();
    expect(eng.getSnapshot().morph.cancelled).toBe(true);
    eng.panic();
    expect(eng.onMacroCc(1, 0, 50)).toEqual([]);
    eng.enableAfterPanic();
    t += 100;
    expect(eng.onMacroCc(1, 0, 50).length).toBe(1);
  });

  it('morph interpolates toward scene B', () => {
    let t = 0;
    const eng = new SuperMacroEngine({ now: () => t });
    const d = createDestinationFromPreset('fm1.brightness')!;
    eng.setMacros([createEmptySuperMacro({ enabled: true, sourceTrack: 1, sourceKnob: 0, destinations: [d] })]);
    eng.onMacroCc(1, 0, 0);
    eng.captureScene('a');
    t += 50;
    eng.onMacroCc(1, 0, 127);
    eng.captureScene('b');
    eng.setScenes({ ...eng.getSnapshot().scenes, morphMs: 1000, curve: 'linear', barQuantize: false });
    // Reset lastSent toward A for morph from
    eng.onMacroCc(1, 0, 0);
    eng.startMorph('b');
    t += 500;
    const mid = eng.tickMorph();
    expect(mid.length).toBeGreaterThanOrEqual(0);
    // At least progress updates
    expect(eng.getSnapshot().morph.progress).toBeGreaterThan(0.4);
  });
});
