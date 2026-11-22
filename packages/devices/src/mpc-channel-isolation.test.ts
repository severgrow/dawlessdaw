import { describe, it, expect, beforeEach } from 'vitest';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildControllerRoutes,
  destHowTo,
  MPC_CHANNEL_ISOLATION_HINT,
  MPC_TRACK_CHANNELS,
  myStudioPreset,
} from './controller';
import { buildMyStudioRoutes } from './studio-layout';
import {
  MPC_CONTROL_CHANNEL,
  resolveSectionBridge,
  DEFAULT_SECTION_BRIDGE,
} from './section-bridge';

/**
 * Regression: Circuit → MPC must stay one track → one channel.
 * User report: drums on ch1, switch to ch3 / change MPC track → ch1 plays the new sound.
 * Root cause is almost always MPC receive = All or monitoring = Auto — not app fan-out.
 */

const ports = { circuitIn: 'c', mpcOut: 'mpc', spOut: 'sp', fm1Out: 'fm1' };
const studioPorts = {
  circuitIn: 'c-in',
  mpcOut: 'scarlett-out',
  spOut: 's-out',
  fm1Out: 'f-out',
};

describe('MPC channel isolation (Circuit → MPC)', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;
  const sentToMpc = () =>
    transport
      .getSent()
      .filter((m) => m.portId === 'mpc' || m.portId === 'scarlett-out')
      .map((m) => Array.from(m.data));

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('maps Circuit T1–T4 to distinct MPC channels 9–12 (not a shared bus)', () => {
    expect(MPC_TRACK_CHANNELS.slice(0, 4)).toEqual([9, 10, 11, 12]);
    const p = myStudioPreset('mpc');
    expect(p.tracks.slice(0, 4).map((t) => t.dest)).toEqual([
      { device: 'mpc', slot: 1 },
      { device: 'mpc', slot: 2 },
      { device: 'mpc', slot: 3 },
      { device: 'mpc', slot: 4 },
    ]);
  });

  it('Controller: T1 note → ch9 only; T3 note → ch11 only; no cross-talk', () => {
    engine.setRoutes(buildControllerRoutes(myStudioPreset('mpc'), ports));
    transport.inject('c', [0x90, 37, 100]); // Circuit T1
    transport.inject('c', [0x92, 48, 90]); // Circuit T3
    expect(sentToMpc()).toEqual([
      [0x98, 37, 100], // note-on ch9
      [0x9a, 48, 90], // note-on ch11
    ]);
  });

  it('Controller: Circuit Program Change never reaches MPC track channels', () => {
    engine.setRoutes(buildControllerRoutes(myStudioPreset('mpc'), ports));
    transport.inject('c', [0xc0, 5]); // PC on Circuit T1
    transport.inject('c', [0xc2, 7]); // PC on Circuit T3
    transport.inject('c', [0xcf, 3]); // PC on ch16 (project)
    expect(sentToMpc()).toEqual([]);
  });

  it('My Studio routes: same per-channel remap + PC blocked on track routes', () => {
    engine.setRoutes(buildMyStudioRoutes(studioPorts));
    transport.inject('c-in', [0x90, 36, 100]);
    transport.inject('c-in', [0x92, 40, 80]);
    transport.inject('c-in', [0xc0, 2]);
    expect(sentToMpc()).toEqual([
      [0x98, 36, 100],
      [0x9a, 40, 80],
    ]);
  });

  it('Section Bridge sequence PC is only on control ch15 — never remapped onto T1–T4', () => {
    const action = resolveSectionBridge(0, DEFAULT_SECTION_BRIDGE); // Project 1
    expect(action).not.toBeNull();
    const mpc = action!.outbound.filter((o) => o.portRole === 'mpc');
    expect(mpc).toHaveLength(1);
    expect(mpc[0]!.data[0]).toBe(0xc0 | ((MPC_CONTROL_CHANNEL - 1) & 0x0f));
    expect(MPC_CONTROL_CHANNEL).toBe(15);
    expect(MPC_TRACK_CHANNELS).not.toContain(15);
  });

  it('howto + isolation hint warn against All / Auto (the Mac-side checklist)', () => {
    const p = myStudioPreset('mpc');
    const tip = destHowTo(p.tracks[0]!.dest!, p);
    expect(tip).toMatch(/not All/i);
    expect(tip).toMatch(/not Auto/i);
    expect(tip).toContain('channel 9');
    expect(MPC_CHANNEL_ISOLATION_HINT).toMatch(/not All/);
    expect(MPC_CHANNEL_ISOLATION_HINT).toMatch(/not Auto/);
    expect(MPC_CHANNEL_ISOLATION_HINT).toMatch(/ch15/);
  });
});
