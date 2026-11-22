import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildControllerRoutes,
  clonePreset,
  controllerWarnings,
  copyTrack,
  describeIncoming,
  destBadge,
  destChannel,
  destHowTo,
  myStudioPreset,
  presetFromTrackPlan,
  sanitizePreset,
  swapKnobs,
  type ControllerPreset,
} from './controller';
import { trackPreset } from './studio-layout';

/** Simulation only — proves the Controller's routing, not the hardware. */
const ports = { circuitIn: 'c', mpcOut: 'mpc', spOut: 'sp', fm1Out: 'fm1' };

describe('Circuit Controller', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;
  const sent = () => transport.getSent().map((m) => [m.portId, ...Array.from(m.data)]);
  const load = (p: ControllerPreset, opts = {}) => engine.setRoutes(buildControllerRoutes(p, ports, opts));

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('My Studio (SP): T1–4 → SP banks A–D, T5–8 → Skiff tracks 1–4 on ch1–4', () => {
    const p = myStudioPreset('sp');
    expect(p.tracks.map((t) => destBadge(t.dest))).toEqual([
      'SP · Bank A',
      'SP · Bank B',
      'SP · Bank C',
      'SP · Bank D',
      'FM1 · Track 1',
      'FM1 · Track 2',
      'FM1 · Track 3',
      'FM1 · Track 4',
    ]);
    load(p);
    transport.inject('c', [0x90, 60, 100]); // T1 note 60 → SP bank A pad 1 (36)
    transport.inject('c', [0x94, 60, 100]); // T5 → Skiff track 1 on ch1, unchanged
    expect(sent()).toEqual([
      ['sp', 0x90, 36, 100],
      ['fm1', 0x90, 60, 100],
    ]);
  });

  it('knobs follow the track: T6 knob 1 → Skiff track 2 Brightness (CC74) on ch2', () => {
    load(myStudioPreset('sp'));
    transport.inject('c', [0xb5, 21, 82]); // T6, macro 1
    transport.inject('c', [0xb5, 28, 50]); // T6, macro 8 → Level (CC7)
    expect(sent()).toEqual([
      ['fm1', 0xb1, 74, 82],
      ['fm1', 0xb1, 7, 50],
    ]);
  });

  it('unmapped knobs, other CCs, Program Change, pitch bend and SysEx are dropped', () => {
    load(myStudioPreset('sp'));
    transport.inject('c', [0xb0, 21, 64]); // T1 → SP, knob not mapped
    transport.inject('c', [0xb4, 31, 64]); // Reverb send — not a macro / mixer Level-Pan
    transport.inject('c', [0xc4, 3]); // Program Change
    transport.inject('c', [0xe4, 0, 64]); // pitch bend
    transport.inject('c', [0xf0, 0x00, 0x20, 0x29, 0xf7]); // SysEx
    expect(sent()).toEqual([]);
  });

  it('MPC variant: tracks 1–4 on ch9–12 with Learnable knobs', () => {
    const p = myStudioPreset('mpc');
    expect(p.tracks.slice(0, 4).map((t) => destChannel(t.dest!, p))).toEqual([9, 10, 11, 12]);
    load(p);
    transport.inject('c', [0x92, 48, 90]); // T3 → MPC track 3 ch11, notes unchanged
    transport.inject('c', [0xb2, 23, 10]); // T3 knob 3 → Learnable 3
    expect(sent()).toEqual([
      ['mpc', 0x9a, 48, 90],
      ['mpc', 0xba, 23, 10],
    ]);
    expect(destHowTo(p.tracks[2]!.dest!, p)).toContain('channel 11');
  });

  it('knob range squeezes 0–127 into min..max', () => {
    const p = clonePreset(myStudioPreset('sp'));
    p.tracks[4]!.knobs[0] = { target: 'fm1.brightness', min: 20, max: 90 };
    load(p);
    transport.inject('c', [0xb4, 21, 0]);
    transport.inject('c', [0xb4, 21, 127]);
    transport.inject('c', [0xb4, 21, 64]);
    expect(sent().map((m) => m[3])).toEqual([20, 90, 55]);
  });

  it('Sound (steps) knob sends Program Change zones only when mapped', () => {
    const p = clonePreset(myStudioPreset('sp'));
    p.tracks[4]!.knobs[7] = { target: 'fm1.sound', min: 0, max: 127 };
    load(p);
    transport.inject('c', [0xb4, 28, 127]);
    expect(sent()).toEqual([['fm1', 0xc0, 7]]);
  });

  it('custom CC and h1 firmware (notes only)', () => {
    const p = clonePreset(myStudioPreset('sp'));
    p.tracks[4]!.knobs[0] = { target: 'custom', cc: 99, min: 0, max: 127 };
    load(p);
    transport.inject('c', [0xb4, 21, 5]);
    expect(sent()).toEqual([['fm1', 0xb0, 99, 5]]);
    transport.clearSent?.();
    load(p, { fm1Firmware: 'h1' });
    const before = transport.getSent().length;
    transport.inject('c', [0xb4, 21, 5]);
    expect(transport.getSent().length).toBe(before);
  });

  it('"MIDI cable from thru box only" sends the MPC nothing', () => {
    const routes = buildControllerRoutes(myStudioPreset('mpc'), ports, { mpcNoteMode: 'din-only' });
    expect(routes.some((r) => r.destinations[0]!.portId === 'mpc')).toBe(false);
  });

  it('copy track and twist-to-pick swap', () => {
    let p = myStudioPreset('sp');
    p = copyTrack(p, 5, [6, 7]);
    expect(p.tracks[5]!.dest).toEqual({ device: 'fm1', slot: 1 });
    p = swapKnobs(myStudioPreset('sp'), 5, 0, 7);
    expect(p.tracks[4]!.knobs[0]!.target).toBe('fm1.level');
    expect(p.tracks[4]!.knobs[7]!.target).toBe('fm1.brightness');
  });

  it('describes what happens in plain words', () => {
    const p = myStudioPreset('sp');
    expect(describeIncoming(p, { kind: 'cc', channel: 5, controller: 21, value: 82 })?.text).toBe(
      'T5 knob 1 → FM1 Track 1 Brightness 82',
    );
    expect(describeIncoming(p, { kind: 'note-on', channel: 1, note: 61, velocity: 90 })?.text).toBe(
      'T1 note 61 → SP-404 Bank A pad 2',
    );
    expect(describeIncoming(p, { kind: 'cc', channel: 1, controller: 22, value: 3 })?.text).toBe(
      'T1 knob 2 → not mapped (dropped)',
    );
  });

  it('warns when two tracks play the same slot', () => {
    const p = copyTrack(myStudioPreset('sp'), 1, [2]);
    expect(controllerWarnings(p)[0]).toContain('T1 and T2 both play SP · Bank A');
  });

  it('sanitizes saved presets', () => {
    const good = sanitizePreset(JSON.parse(JSON.stringify(myStudioPreset('mpc'))));
    expect(good?.tracks[0]?.dest).toEqual({ device: 'mpc', slot: 1 });
    const bad = sanitizePreset({
      id: 'x',
      name: 'x',
      tracks: [{ dest: { device: 'sp', slot: 99 }, knobs: [{ target: 'nope', min: -5, max: 300 }] }],
    });
    expect(bad?.tracks[0]?.dest).toBeNull();
    expect(bad?.tracks[0]?.knobs[0]).toEqual({ target: null, min: 0, max: 127 });
    expect(sanitizePreset(null)).toBeNull();
  });

  it('migrates the old Rig grid plan', () => {
    const p = presetFromTrackPlan(trackPreset('sp-fm1'), -24, 'skiff');
    expect(p.tracks[0]!.dest).toEqual({ device: 'sp', slot: 1 });
    expect(p.tracks[0]!.firstNote).toBe(60);
    expect(destChannel(p.tracks[4]!.dest!, p)).toBe(5); // FM1 stays on the Circuit's own channel
  });
});
