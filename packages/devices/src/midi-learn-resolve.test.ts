import { describe, it, expect } from 'vitest';
import {
  controlMappingKey,
  isLearnGlassIgnoredMidi,
  myStudioPreset,
  resolveControlMapping,
  clonePreset,
  buildControllerRoutes,
} from './controller';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';

const ports = { circuitIn: 'c', mpcOut: 'mpc', spOut: 'sp', fm1Out: 'fm1' };

describe('resolveControlMapping', () => {
  it('resolves T5 Macro 8 → FM1 Level CC7 on ch1 (My Studio SP)', () => {
    const r = resolveControlMapping(myStudioPreset('sp'), {
      kind: 'cc',
      channel: 5,
      controller: 28,
      value: 50,
    });
    expect(r).toMatchObject({
      track: 5,
      kind: 'macro',
      knob: 7,
      sourceLabel: 'Circuit Track 5 · Macro 8',
      paramLabel: 'Level',
      editableKnob: true,
    });
    expect(r!.detail).toContain('CC7');
    expect(r!.detail).toContain('ch1');
    expect(r!.dest).toEqual({ device: 'fm1', slot: 1 });
  });

  it('resolves unmapped SP track macro as dropped, still editable', () => {
    const r = resolveControlMapping(myStudioPreset('sp'), {
      kind: 'cc',
      channel: 1,
      controller: 21,
      value: 10,
    });
    expect(r?.paramLabel).toBe('not mapped');
    expect(r?.detail).toContain('dropped');
    expect(r?.dest?.device).toBe('sp');
    expect(r?.editableKnob).toBe(true);
  });

  it('resolves Mixer Level on T6 → FM1 Volume; T3 → SP', () => {
    const p = myStudioPreset('sp');
    const fm = resolveControlMapping(p, { kind: 'cc', channel: 6, controller: 29, value: 40 });
    expect(fm).toMatchObject({
      track: 6,
      kind: 'mixer-level',
      sourceLabel: 'Circuit Track 6 · Mixer Level',
      paramLabel: 'Volume (CC7)',
      editableKnob: false,
    });
    expect(fm!.detail).toContain('FM1');
    expect(fm!.detail).toContain('ch2');

    const sp = resolveControlMapping(p, { kind: 'cc', channel: 3, controller: 29, value: 40 });
    expect(sp!.dest?.device).toBe('sp');
    expect(sp!.detail).toContain('Bank C');
  });

  it('Circuit-only when track dest is off', () => {
    const p = clonePreset(myStudioPreset('sp'));
    p.tracks[5]!.dest = null;
    const r = resolveControlMapping(p, { kind: 'cc', channel: 6, controller: 22, value: 1 });
    expect(r?.detail).toContain('Circuit only');
    expect(r?.dest).toBeNull();
  });

  it('per-track destinations differ (T5→FM1, T6 can be SP)', () => {
    const p = clonePreset(myStudioPreset('sp'));
    p.tracks[5]!.dest = { device: 'sp', slot: 5 };
    p.tracks[5]!.knobs[0] = { target: 'sp.fx1', min: 0, max: 127 };
    const t5 = resolveControlMapping(p, { kind: 'cc', channel: 5, controller: 21, value: 64 });
    const t6 = resolveControlMapping(p, { kind: 'cc', channel: 6, controller: 21, value: 64 });
    expect(t5!.dest).toEqual({ device: 'fm1', slot: 1 });
    expect(t6!.dest).toEqual({ device: 'sp', slot: 5 });
    expect(t5!.paramLabel).toBe('Brightness');
    expect(t6!.paramLabel).toBe('Effect control 1');
    expect(controlMappingKey(t5!)).not.toBe(controlMappingKey(t6!));
  });

  it('ignores notes and returns null for non-user CCs', () => {
    expect(resolveControlMapping(myStudioPreset('sp'), { kind: 'note-on', channel: 1, controller: 21 })).toBeNull();
    expect(resolveControlMapping(myStudioPreset('sp'), { kind: 'cc', channel: 1, controller: 7 })).toBeNull();
    expect(resolveControlMapping(myStudioPreset('sp'), { kind: 'cc', channel: 1, controller: 31 })).toBeNull();
  });

  it('isLearnGlassIgnoredMidi covers clock / F8 family', () => {
    expect(isLearnGlassIgnoredMidi('clock')).toBe(true);
    expect(isLearnGlassIgnoredMidi('start')).toBe(true);
    expect(isLearnGlassIgnoredMidi('stop')).toBe(true);
    expect(isLearnGlassIgnoredMidi('continue')).toBe(true);
    expect(isLearnGlassIgnoredMidi('cc')).toBe(false);
    expect(isLearnGlassIgnoredMidi('note-on')).toBe(false);
  });
});

describe('buildControllerRoutes + mixer', () => {
  it('forwards Mixer Level through controller routes to FM1 Volume', async () => {
    const transport = new MockMidiTransport();
    await transport.start();
    const engine = new MidiRoutingEngine(transport);
    engine.start();
    engine.setRoutes(buildControllerRoutes(myStudioPreset('sp'), ports));
    transport.inject('c', [0xb5, 29, 77]); // T6 mixer level
    expect(transport.getSent().map((m) => [m.portId, ...Array.from(m.data)])).toEqual([
      ['fm1', 0xb1, 7, 77], // Skiff T2 = ch2
    ]);
  });
});
