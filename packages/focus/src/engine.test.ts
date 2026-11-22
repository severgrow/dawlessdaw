import { describe, it, expect } from 'vitest';
import { FocusEngine } from './engine';
import type { MidiMessage } from '@nervos/core';

function note(portId: string, n = 60): MidiMessage {
  return {
    data: new Uint8Array([0x90, n, 100]),
    timestamp: 0,
    portId,
    kind: 'note-on',
    channel: 1,
    note: n,
    velocity: 100,
  };
}

function clock(portId: string): MidiMessage {
  return {
    data: new Uint8Array([0xf8]),
    timestamp: 0,
    portId,
    kind: 'clock',
  };
}

describe('FocusEngine', () => {
  it('follow mode switches focus to active device', () => {
    const eng = new FocusEngine(undefined, { hysteresisMs: 0 });
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    expect(eng.onMidi(note('a'), undefined, 1000)).toBe(true);
    expect(eng.getState().activeDeviceId).toBe('dev-a');
    expect(eng.onMidi(note('b'), undefined, 2000)).toBe(true);
    expect(eng.getState().activeDeviceId).toBe('dev-b');
  });

  it('ignores clock for focus (no thrashing)', () => {
    const eng = new FocusEngine(undefined, { hysteresisMs: 0 });
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    eng.onMidi(note('a'), undefined, 1000);
    const changed = eng.onMidi(clock('b'), undefined, 1001);
    expect(changed).toBe(false);
    expect(eng.getState().activeDeviceId).toBe('dev-a');
  });

  it('applies hysteresis instead of thrashing', () => {
    const eng = new FocusEngine(undefined, { hysteresisMs: 500, softFocusMs: 800 });
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    eng.onMidi(note('a'), undefined, 1000);
    const changed = eng.onMidi(note('b'), undefined, 1100);
    expect(changed).toBe(false);
    expect(eng.getState().activeDeviceId).toBe('dev-a');
    expect(eng.getState().softFocus?.deviceId).toBe('dev-b');
  });

  it('pin locks focus; soft-focus tracks secondary', () => {
    const eng = new FocusEngine(undefined, { hysteresisMs: 0 });
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    eng.onMidi(note('a'), undefined, 1000);
    eng.pin('dev-a');
    expect(eng.getState().mode).toBe('manual');
    const changed = eng.onMidi(note('b'), undefined, 2000);
    expect(changed).toBe(false);
    expect(eng.getState().activeDeviceId).toBe('dev-a');
    expect(eng.getState().softFocus?.deviceId).toBe('dev-b');
  });

  it('smart mode requires threshold before switch', () => {
    const eng = new FocusEngine(undefined, {
      hysteresisMs: 0,
      smartThreshold: 2,
      smartWindowMs: 600,
    });
    eng.setMode('smart');
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    eng.onMidi(note('a'), undefined, 1000);
    // force active a (pass test clock so hysteresis stays deterministic)
    eng.select('dev-a', 1500);
    expect(eng.onMidi(note('b'), undefined, 2000)).toBe(false);
    expect(eng.getState().softFocus?.deviceId).toBe('dev-b');
    expect(eng.onMidi(note('b'), undefined, 2100)).toBe(true);
    expect(eng.getState().activeDeviceId).toBe('dev-b');
  });

  it('manual mode does not auto-follow', () => {
    const eng = new FocusEngine(undefined, { hysteresisMs: 0 });
    eng.mapPort('a', 'dev-a');
    eng.mapPort('b', 'dev-b');
    eng.select('dev-a');
    eng.setMode('manual');
    eng.pin('dev-a');
    expect(eng.onMidi(note('b'), undefined, 3000)).toBe(false);
    expect(eng.getState().activeDeviceId).toBe('dev-a');
  });
});
