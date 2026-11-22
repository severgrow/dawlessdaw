import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildMyStudioRoutes,
  defaultSendChannel,
  legacyTrackPlan,
  sanitizeTrackPlan,
  setTrackSend,
  trackPlanWarnings,
  trackPreset,
} from './studio-layout';

/** Simulation only — proves the Rig grid's routing, not the hardware. */
const ports = { circuitIn: 'c-in', mpcOut: 'm-out', spOut: 's-out', fm1Out: 'f-out' };

describe('Rig grid track plan', () => {
  it('the default plan builds exactly the same routes as before', () => {
    const legacy = buildMyStudioRoutes(ports);
    const viaPlan = buildMyStudioRoutes({ ...ports, trackPlan: legacyTrackPlan('mpc', 'skiff') });
    expect(viaPlan).toEqual(legacy);
    for (const t of ['sp', 'both'] as const) {
      expect(
        buildMyStudioRoutes({ ...ports, trackPlan: legacyTrackPlan(t, 'skiff') }),
      ).toEqual(buildMyStudioRoutes({ ...ports, circuitT1to4Target: t }));
    }
  });

  it('adds, changes and removes one send without touching others', () => {
    let plan = trackPreset('mpc-fm1');
    plan = setTrackSend(plan, 5, 'mpc', 13);
    expect(plan[5]).toEqual([
      { dest: 'mpc', channel: 13 },
      { dest: 'fm1', channel: 5 },
    ]);
    plan = setTrackSend(plan, 5, 'mpc', 14);
    expect(plan[5]!.find((s) => s.dest === 'mpc')?.channel).toBe(14);
    plan = setTrackSend(plan, 5, 'fm1', null);
    expect(plan[5]).toEqual([{ dest: 'mpc', channel: 14 }]);
    expect(plan[1]).toEqual([{ dest: 'mpc', channel: 9 }]);
  });

  it('routes a track to a new device and channel through the engine', async () => {
    const transport = new MockMidiTransport();
    await transport.start();
    const engine = new MidiRoutingEngine(transport);
    engine.start();
    let plan = trackPreset('none');
    plan = setTrackSend(plan, 7, 'mpc', 13);
    plan = setTrackSend(plan, 2, 'sp', 5);
    engine.setRoutes(buildMyStudioRoutes({ ...ports, trackPlan: plan, spNoteOffset: -24 }));
    transport.inject('c-in', [0x96, 60, 100]); // T7
    transport.inject('c-in', [0x91, 60, 100]); // T2
    transport.inject('c-in', [0x90, 60, 100]); // T1 — not sent anywhere
    const sent = transport.getSent().map((m) => [m.portId, ...Array.from(m.data)]);
    expect(sent).toEqual([
      ['m-out', 0x9c, 60, 100], // MPC ch13
      ['s-out', 0x94, 36, 100], // SP bank E (ch5), pad 1
    ]);
  });

  it('"Nothing" preset sends no notes', () => {
    const routes = buildMyStudioRoutes({ ...ports, trackPlan: trackPreset('none') });
    expect(routes).toEqual([]);
  });

  it('sensible default channels', () => {
    expect(defaultSendChannel('mpc', 1)).toBe(9);
    expect(defaultSendChannel('mpc', 4)).toBe(12);
    expect(defaultSendChannel('mpc', 5)).toBe(13);
    expect(defaultSendChannel('mpc', 7)).not.toBe(15);
    expect(defaultSendChannel('sp', 3)).toBe(3);
    expect(defaultSendChannel('fm1', 6)).toBe(6);
  });

  it('sanitizes saved plans: bad devices, channels and duplicates are dropped', () => {
    const plan = sanitizeTrackPlan({
      1: [
        { dest: 'mpc', channel: 9 },
        { dest: 'mpc', channel: 10 },
        { dest: 'sp', channel: 12 },
        { dest: 'drum', channel: 1 },
      ],
      2: 'junk',
    });
    expect(plan?.[1]).toEqual([{ dest: 'mpc', channel: 9 }]);
    expect(plan?.[2]).toEqual([]);
    expect(sanitizeTrackPlan(null)).toBeNull();
  });

  it('warns about layering, the MPC control channel and SP doubles', () => {
    let plan = trackPreset('none');
    plan = setTrackSend(plan, 1, 'mpc', 9);
    plan = setTrackSend(plan, 2, 'mpc', 9);
    plan = setTrackSend(plan, 3, 'mpc', 15);
    plan = setTrackSend(plan, 4, 'sp', 4);
    const w = trackPlanWarnings(plan, { spNoteOffset: 0, mpcNoteMode: 'usb' });
    expect(w.some((x) => x.includes('T1 and T2 both play MPC ch9'))).toBe(true);
    expect(w.some((x) => x.includes('ch15'))).toBe(true);
    expect(w.some((x) => x.includes('plays twice'))).toBe(true);
    expect(trackPlanWarnings(trackPreset('mpc-fm1'), { spNoteOffset: -24, mpcNoteMode: 'usb' })).toEqual([]);
  });
});
