import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HW_BINDINGS,
  HardwareControlEngine,
  HW_CONTROL_FORBIDDEN,
  HW_GUIDE_BUTTONS,
  applyTriggerHysteresis,
  buildHardwareGuide,
  emptyHysteresis,
  mapContinuousCc,
} from './hardware-control';

describe('hardware control hysteresis', () => {
  it('fires once on rising cross, re-arms below low', () => {
    let st = emptyHysteresis(true);
    let r = applyTriggerHysteresis(st, 50);
    expect(r.fired).toBe(false);
    st = r.state;

    r = applyTriggerHysteresis(st, 95);
    expect(r.fired).toBe(true);
    st = r.state;

    r = applyTriggerHysteresis(st, 100);
    expect(r.fired).toBe(false); // still high, not re-armed
    st = r.state;

    r = applyTriggerHysteresis(st, 30);
    expect(r.fired).toBe(false); // re-arm only
    expect(r.state.armed).toBe(true);
    st = r.state;

    r = applyTriggerHysteresis(st, 92);
    expect(r.fired).toBe(true);
  });
});

describe('hardware control mapping', () => {
  it('maps continuous macros to settings patches', () => {
    expect(mapContinuousCc('set-root', 0)).toEqual({
      type: 'settings',
      patch: { root: 0 },
    });
    expect(mapContinuousCc('set-root', 127)?.type).toBe('settings');
    const dens = mapContinuousCc('set-density', 64);
    expect(dens).toMatchObject({ type: 'settings' });
    if (dens?.type === 'settings') {
      expect(dens.patch.density).toBeCloseTo(64 / 127, 2);
    }
    expect(mapContinuousCc('generate', 100)).toBeNull();
  });

  it('default bindings cover CC 21–28 and optional 29/30', () => {
    const ccs = DEFAULT_HW_BINDINGS.map((b) => b.cc);
    expect(ccs).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(DEFAULT_HW_BINDINGS.filter((b) => b.kind === 'trigger').length).toBeGreaterThanOrEqual(3);
  });
});

describe('HardwareControlEngine', () => {
  it('ignores CCs when mode off (routes stay free)', () => {
    const eng = new HardwareControlEngine();
    expect(eng.isEnabled()).toBe(false);
    expect(eng.onCc(1, 26, 127)).toBeNull();
    expect(eng.onCc(1, 21, 64)).toBeNull();
  });

  it('continuous + trigger when enabled; mixer gated', () => {
    const eng = new HardwareControlEngine();
    eng.setEnabled(true);

    const root = eng.onCc(3, 21, 0);
    expect(root).toEqual({ type: 'settings', patch: { root: 0 } });

    // Generate trigger: need rise above high
    expect(eng.onCc(3, 26, 20)).toBeNull();
    expect(eng.onCc(3, 26, 95)).toEqual({ type: 'generate' });
    expect(eng.onCc(3, 26, 100)).toBeNull();
    eng.onCc(3, 26, 10); // re-arm
    expect(eng.onCc(3, 26, 91)).toEqual({ type: 'generate' });

    // Mixer off → 29 ignored
    expect(eng.onCc(3, 29, 100)).toBeNull();
    eng.setMixerEnabled(true);
    eng.onCc(3, 29, 0);
    expect(eng.onCc(3, 29, 100)).toEqual({ type: 'toggle-lock' });
  });

  it('forbids inventing button MIDI / SysEx / breaking routes when off', () => {
    expect(HW_CONTROL_FORBIDDEN.inventedButtonMidi).toBe(true);
    expect(HW_CONTROL_FORBIDDEN.sysex).toBe(true);
    expect(HW_CONTROL_FORBIDDEN.breakRoutesWhenOff).toBe(true);
    expect(HW_CONTROL_FORBIDDEN.guidedRecordClaim).toBe(true);
    expect(HW_GUIDE_BUTTONS.every((b) => b.onDevice.toLowerCase().includes('no midi') || b.onDevice.toLowerCase().includes('guide'))).toBe(
      true,
    );
  });
});

describe('adaptive Hardware Guide', () => {
  it('highlights next action and keeps buttons Guide-only', () => {
    const cold = buildHardwareGuide({
      circuitInAssigned: false,
      modeEnabled: false,
      mixerEnabled: false,
      hasSource: false,
      ccTxHint: false,
    });
    expect(cold.find((s) => s.id === 'ports')?.active).toBe(true);

    const armed = buildHardwareGuide({
      circuitInAssigned: true,
      modeEnabled: true,
      mixerEnabled: false,
      hasSource: true,
      ccTxHint: true,
    });
    expect(armed.find((s) => s.id === 'macros')?.active).toBe(true);
    expect(armed.filter((s) => s.kind === 'button').every((s) => !s.active)).toBe(true);
    expect(armed.some((s) => s.id === 'btn-mute')).toBe(true);
  });
});
