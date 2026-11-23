import { describe, it, expect, beforeEach } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import {
  buildMyStudioRoutes,
  CLOCK_ROUTE_BLOCK_KINDS,
  migrateClockForwarding,
  anyClockForwarding,
} from './studio-layout';
import {
  assignPort,
  looksLikeAkaiMpcUsbPort,
  looksLikeMidiInterfaceOut,
  matchPortsToRoles,
  mpcClockPortAdvice,
  portsForRoles,
} from './port-matcher';

/**
 * Simulation only — proves routing and settings logic, not that the MPC
 * follows clock on real hardware (that is bench g2 / g3).
 */

const base = { circuitIn: 'c-in', mpcOut: 'scarlett-out', spOut: 's-out', fm1Out: 'f-out' };

describe('per-device clock routes', () => {
  it('adds no clock route by default', () => {
    const routes = buildMyStudioRoutes(base);
    expect(routes.some((r) => r.forwardClock === true)).toBe(false);
  });

  it.each([
    ['clockToMpc', 'mystudio-clock-mpc', 'scarlett-out'],
    ['clockToSp', 'mystudio-clock-sp', 's-out'],
    ['forwardClockToFm1', 'mystudio-clock-fm1', 'f-out'],
  ] as const)('%s adds one clock-only route to that device only', (flag, id, port) => {
    const routes = buildMyStudioRoutes({ ...base, [flag]: true });
    const clock = routes.filter((r) => r.forwardClock === true);
    expect(clock.map((r) => r.id)).toEqual([id]);
    expect(clock[0]!.sourcePortId).toBe('c-in');
    expect(clock[0]!.destinations.map((d) => d.portId)).toEqual([port]);
    expect(clock[0]!.blockKinds).toEqual(CLOCK_ROUTE_BLOCK_KINDS);
  });

  it('all three on gives three separate routes', () => {
    const routes = buildMyStudioRoutes({
      ...base,
      clockToMpc: true,
      clockToSp: true,
      forwardClockToFm1: true,
    });
    expect(routes.filter((r) => r.forwardClock).map((r) => r.id)).toEqual([
      'mystudio-clock-mpc',
      'mystudio-clock-sp',
      'mystudio-clock-fm1',
    ]);
  });

  it('"MIDI cable from thru box only" sends the MPC no clock either', () => {
    const routes = buildMyStudioRoutes({ ...base, clockToMpc: true, mpcNoteMode: 'din-only' });
    expect(routes.some((r) => r.destinations.some((d) => d.portId === 'scarlett-out'))).toBe(false);
  });

  it('clock routes block notes/CC/SysEx but allow clock / start / stop / continue / SPP', () => {
    expect(CLOCK_ROUTE_BLOCK_KINDS).toEqual(
      expect.arrayContaining(['note-on', 'note-off', 'cc', 'program-change', 'sysex']),
    );
    expect(CLOCK_ROUTE_BLOCK_KINDS).not.toContain('song-position');
    for (const k of ['clock', 'start', 'stop', 'continue', 'song-position']) {
      expect(CLOCK_ROUTE_BLOCK_KINDS).not.toContain(k);
    }
  });
});

describe('clock forwarding through the engine', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;
  const sentTo = (portId: string) =>
    transport
      .getSent()
      .filter((m) => m.portId === portId)
      .map((m) => Array.from(m.data));

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
  });

  it('clock → MPC only: MPC gets start/clock/stop, SP and FM1 get none', () => {
    engine.setRoutes(buildMyStudioRoutes({ ...base, clockToMpc: true }));
    engine.setClockAuthority('c-in');
    transport.inject('c-in', [0xfa]);
    transport.inject('c-in', [0xf8]);
    transport.inject('c-in', [0xfc]);
    expect(sentTo('scarlett-out')).toEqual([[0xfa], [0xf8], [0xfc]]);
    expect(sentTo('s-out')).toEqual([]);
    expect(sentTo('f-out')).toEqual([]);
  });

  it('forwards continue + Song Position (SPP) when Circuit sends them', () => {
    engine.setRoutes(buildMyStudioRoutes({ ...base, clockToMpc: true }));
    engine.setClockAuthority('c-in');
    transport.inject('c-in', [0xfb]); // continue
    transport.inject('c-in', [0xf2, 0x00, 0x08]); // SPP
    expect(sentTo('scarlett-out')).toEqual([[0xfb], [0xf2, 0x00, 0x08]]);
  });

  it('notes still go to the MPC once (ch9–12), not doubled by the clock route', () => {
    engine.setRoutes(buildMyStudioRoutes({ ...base, clockToMpc: true }));
    engine.setClockAuthority('c-in');
    transport.inject('c-in', [0x90, 36, 100]); // Circuit T1
    expect(sentTo('scarlett-out')).toEqual([[0x98, 36, 100]]);
  });

  it('notes + transport coexist: ch9 note and Start both reach Scarlett once each', () => {
    engine.setRoutes(buildMyStudioRoutes({ ...base, clockToMpc: true }));
    engine.setClockAuthority('c-in');
    transport.inject('c-in', [0xfa]);
    transport.inject('c-in', [0x90, 36, 100]);
    transport.inject('c-in', [0xf8]);
    expect(sentTo('scarlett-out')).toEqual([[0xfa], [0x98, 36, 100], [0xf8]]);
  });

  it('a clock route never forwards SysEx', () => {
    engine.setRoutes(buildMyStudioRoutes({ ...base, clockToMpc: true }));
    engine.setClockAuthority('c-in');
    transport.inject('c-in', [0xf0, 0x00, 0x20, 0x29, 0xf7]);
    expect(sentTo('scarlett-out')).toEqual([]);
  });
});

describe('settings migration', () => {
  it('no saved settings: everything off', () => {
    expect(migrateClockForwarding(null)).toEqual({ mpc: false, sp: false, fm1: false });
  });

  it('old forwarding ON becomes MPC on, SP off', () => {
    expect(migrateClockForwarding({ version: 1, routeClockThroughApp: true })).toEqual({
      mpc: true,
      sp: false,
      fm1: false,
    });
  });

  it('old forwarding OFF stays off; old FM1 clock is kept', () => {
    expect(
      migrateClockForwarding({ version: 1, routeClockThroughApp: false, forwardClockToFm1: true }),
    ).toEqual({ mpc: false, sp: false, fm1: true });
  });

  it('new saves use the per-device flags and ignore the old one', () => {
    expect(
      migrateClockForwarding({
        version: 2,
        routeClockThroughApp: true,
        clockToMpc: false,
        clockToSp: true,
      }),
    ).toEqual({ mpc: false, sp: true, fm1: false });
  });

  it('any switch on makes the Circuit the clock authority', () => {
    expect(anyClockForwarding({ mpc: false, sp: false, fm1: false })).toBe(false);
    expect(anyClockForwarding({ mpc: false, sp: true, fm1: false })).toBe(true);
  });
});

describe('MPC Out = Scarlett (picked by hand)', () => {
  const studio: MidiPortInfo[] = [
    { id: 'c-in', name: 'Circuit Rhythm', type: 'input', state: 'connected' },
    { id: 's-out', name: 'SP-404MKII', type: 'output', state: 'connected' },
    { id: 'f-out', name: 'Felucca', type: 'output', state: 'connected' },
    { id: 'sc-in', name: 'Scarlett 2i4 USB', type: 'input', state: 'connected' },
    { id: 'sc-out', name: 'Scarlett 2i4 USB', type: 'output', state: 'connected' },
  ];

  it('is not auto-matched to the MPC', () => {
    const a = matchPortsToRoles(studio);
    expect(portsForRoles(a).mpcOut).toBeNull();
  });

  it('can be assigned by hand and survives a reload (JSON round trip)', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    const reloaded = JSON.parse(JSON.stringify(a));
    const again = matchPortsToRoles(studio, reloaded);
    expect(portsForRoles(again).mpcOut).toBe('sc-out');
    expect(again.find((x) => x.roleId === 'mpc')?.outputManual).toBe(true);
  });

  it('re-binds by name when Chrome gives the port a new id', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    const renumbered = studio.map((p) => (p.id === 'sc-out' ? { ...p, id: 'sc-out-NEW' } : p));
    expect(portsForRoles(matchPortsToRoles(renumbered, a)).mpcOut).toBe('sc-out-NEW');
  });

  it('is remembered while the Scarlett is unplugged and comes back when replugged', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    const unplugged = studio.filter((p) => !p.id.startsWith('sc-'));
    const gone = matchPortsToRoles(unplugged, a);
    const mpc = gone.find((x) => x.roleId === 'mpc')!;
    expect(mpc.outputPortId).toBeNull();
    expect(mpc.outputManual).toBe(true);
    expect(mpc.outputPortName).toBe('Scarlett 2i4 USB');
    expect(mpc.connected).toBe(false);
    const back = matchPortsToRoles(studio, JSON.parse(JSON.stringify(gone)));
    expect(portsForRoles(back).mpcOut).toBe('sc-out');
  });

  it('a hand-picked MPC slot is not filled by an Akai port appearing', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    const withAkai: MidiPortInfo[] = [
      ...studio,
      { id: 'akai-out', name: 'MPC One', type: 'output', state: 'connected' },
    ];
    expect(portsForRoles(matchPortsToRoles(withAkai, a)).mpcOut).toBe('sc-out');
  });

  it('picking "—" hands the slot back to automatic matching', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    a = assignPort(a, 'mpc', 'output', null, studio);
    expect(a.find((x) => x.roleId === 'mpc')?.outputManual).toBe(false);
    expect(portsForRoles(matchPortsToRoles(studio, a)).mpcOut).toBeNull();
  });

  it('other roles cannot take the hand-picked Scarlett port', () => {
    let a = matchPortsToRoles(studio);
    a = assignPort(a, 'mpc', 'output', 'sc-out', studio);
    const again = matchPortsToRoles(studio, a);
    const users = again.filter((x) => x.outputPortId === 'sc-out').map((x) => x.roleId);
    expect(users).toEqual(['mpc']);
  });
});

describe('MPC clock port advice (Scarlett DIN vs Akai USB)', () => {
  it('recognises Scarlett / interface names as DIN-friendly', () => {
    expect(looksLikeMidiInterfaceOut('Scarlett 2i4 USB')).toBe(true);
    expect(looksLikeMidiInterfaceOut('Focusrite USB MIDI')).toBe(true);
    expect(looksLikeAkaiMpcUsbPort('Scarlett 2i4 USB')).toBe(false);
  });

  it('flags Akai MPC USB names as unsuitable for clock', () => {
    expect(looksLikeAkaiMpcUsbPort('MPC One')).toBe(true);
    expect(looksLikeAkaiMpcUsbPort('Akai Professional MPC One')).toBe(true);
    expect(looksLikeMidiInterfaceOut('MPC One')).toBe(false);
  });

  it('mpcClockPortAdvice warns on Akai USB and oks Scarlett', () => {
    expect(mpcClockPortAdvice(null).kind).toBe('unset');
    expect(mpcClockPortAdvice('MPC One').kind).toBe('warn-akai-usb');
    expect(mpcClockPortAdvice('Scarlett 2i4 USB').kind).toBe('ok-interface');
  });

  it('mpcClockPortAdvice warns Network / IAC separately from USB-B', () => {
    expect(mpcClockPortAdvice('Network Session 1').kind).toBe('warn-network');
    expect(mpcClockPortAdvice('IAC Driver Bus 1').kind).toBe('warn-iac');
  });
});
