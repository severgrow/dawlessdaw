import { describe, it, expect } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import {
  matchPortsToRoles,
  assignPort,
  portsForRoles,
  scorePortAgainstHints,
  unmatchedConnectedPorts,
  roleUsingPort,
} from './port-matcher';
import {
  buildMyStudioRoutes,
  myStudioTemplateRoutes,
  rebindRoutesToAssignments,
  MY_STUDIO_ROLES,
} from './studio-layout';
import {
  resolveSectionBridge,
  DEFAULT_SECTION_BRIDGE,
  SP_PATTERN_PC_CHANNEL,
  MPC_CONTROL_CHANNEL,
  MPC_MUTE_LEARN_CHANNEL,
} from './section-bridge';

const ports: MidiPortInfo[] = [
  { id: 'c-in', name: 'Circuit Rhythm MIDI', type: 'input', state: 'connected' },
  { id: 'c-out', name: 'Circuit Rhythm MIDI', type: 'output', state: 'connected' },
  { id: 'm-in', name: 'MPC One', type: 'input', state: 'connected' },
  { id: 'm-out', name: 'MPC One', type: 'output', state: 'connected' },
  { id: 's-in', name: 'SP-404MKII', type: 'input', state: 'connected' },
  { id: 's-out', name: 'SP-404MKII', type: 'output', state: 'connected' },
  { id: 'f-in', name: 'M-VAVE FM1', type: 'input', state: 'connected' },
  { id: 'f-out', name: 'M-VAVE FM1', type: 'output', state: 'connected' },
];

describe('port matching', () => {
  it('matches devices by name hints', () => {
    const a = matchPortsToRoles(ports);
    expect(a.find((x) => x.roleId === 'circuit')?.inputPortId).toBe('c-in');
    expect(a.find((x) => x.roleId === 'mpc')?.outputPortId).toBe('m-out');
    expect(a.find((x) => x.roleId === 'sp404')?.outputPortId).toBe('s-out');
    expect(a.find((x) => x.roleId === 'fm1')?.outputPortId).toBe('f-out');
    expect(a.find((x) => x.roleId === 'zed')?.connected).toBe(true);
  });

  it('keeps previous assignment when port still present', () => {
    const first = matchPortsToRoles(ports);
    const manual = assignPort(first, 'fm1', 'output', 'm-out', ports);
    const again = matchPortsToRoles(ports, manual);
    expect(again.find((x) => x.roleId === 'fm1')?.outputPortId).toBe('m-out');
  });

  it('marks missing device disconnected without dropping role', () => {
    const partial = ports.filter((p) => !p.name.includes('FM1'));
    const a = matchPortsToRoles(partial);
    const fm1 = a.find((x) => x.roleId === 'fm1')!;
    expect(fm1.connected).toBe(false);
    expect(fm1.outputPortId).toBeNull();
  });
});

describe('Mac / Live hint matching', () => {
  const mpcHints = MY_STUDIO_ROLES.find((r) => r.id === 'mpc')!.portNameHints;
  const fm1Hints = MY_STUDIO_ROLES.find((r) => r.id === 'fm1')!.portNameHints;
  const circuitHints = MY_STUDIO_ROLES.find((r) => r.id === 'circuit')!.portNameHints;
  const spHints = MY_STUDIO_ROLES.find((r) => r.id === 'sp404')!.portNameHints;

  it('matches Akai Professional MPC One (non-contiguous akai…mpc)', () => {
    expect(
      scorePortAgainstHints({ name: 'Akai Professional MPC One' }, mpcHints),
    ).toBeGreaterThan(0);
    expect(
      scorePortAgainstHints(
        { name: 'Akai Professional MPC One Port 1', manufacturer: 'Akai Professional' },
        mpcHints,
      ),
    ).toBeGreaterThan(0);
  });

  it('matches FM1 / H-1 CDC and truncated brand names', () => {
    expect(scorePortAgainstHints({ name: 'M-VAVE' }, fm1Hints)).toBeGreaterThan(0);
    expect(scorePortAgainstHints({ name: 'MVAV' }, fm1Hints)).toBeGreaterThan(0);
    expect(scorePortAgainstHints({ name: 'CH345' }, fm1Hints)).toBeGreaterThan(0);
    expect(scorePortAgainstHints({ name: 'Felucca' }, fm1Hints)).toBeGreaterThan(0);
    expect(scorePortAgainstHints({ name: 'H-1 MIDI' }, fm1Hints)).toBeGreaterThan(0);
    expect(
      scorePortAgainstHints({ name: 'USB-MIDI', manufacturer: 'wch.cn' }, fm1Hints),
    ).toBeGreaterThan(0);
  });

  it('does not score Circuit/SP names against MPC or FM1 hints', () => {
    expect(scorePortAgainstHints({ name: 'Circuit Rhythm MIDI' }, mpcHints)).toBe(0);
    expect(scorePortAgainstHints({ name: 'SP-404MKII' }, mpcHints)).toBe(0);
    expect(scorePortAgainstHints({ name: 'Circuit Rhythm MIDI' }, fm1Hints)).toBe(0);
    expect(scorePortAgainstHints({ name: 'SP-404MKII' }, fm1Hints)).toBe(0);
    expect(scorePortAgainstHints({ name: 'Akai Professional MPC One' }, circuitHints)).toBe(0);
    expect(scorePortAgainstHints({ name: 'CH345' }, spHints)).toBe(0);
  });

  it('auto-binds Mac-like port names without stealing Circuit/SP', () => {
    const macPorts: MidiPortInfo[] = [
      { id: 'c-in', name: 'Circuit Rhythm', type: 'input', state: 'connected' },
      { id: 'c-out', name: 'Circuit Rhythm', type: 'output', state: 'connected' },
      {
        id: 'm-in',
        name: 'Akai Professional MPC One',
        manufacturer: 'Akai Professional',
        type: 'input',
        state: 'connected',
      },
      {
        id: 'm-out',
        name: 'Akai Professional MPC One',
        manufacturer: 'Akai Professional',
        type: 'output',
        state: 'connected',
      },
      { id: 's-in', name: 'SP-404MKII', type: 'input', state: 'connected' },
      { id: 's-out', name: 'SP-404MKII', type: 'output', state: 'connected' },
      { id: 'f-in', name: 'CH345', manufacturer: 'wch.cn', type: 'input', state: 'connected' },
      { id: 'f-out', name: 'CH345', manufacturer: 'wch.cn', type: 'output', state: 'connected' },
    ];
    const a = matchPortsToRoles(macPorts);
    expect(a.find((x) => x.roleId === 'circuit')?.inputPortId).toBe('c-in');
    expect(a.find((x) => x.roleId === 'mpc')?.inputPortId).toBe('m-in');
    expect(a.find((x) => x.roleId === 'mpc')?.outputPortId).toBe('m-out');
    expect(a.find((x) => x.roleId === 'sp404')?.outputPortId).toBe('s-out');
    expect(a.find((x) => x.roleId === 'fm1')?.inputPortId).toBe('f-in');
    expect(a.find((x) => x.roleId === 'fm1')?.connected).toBe(true);
    expect(unmatchedConnectedPorts(macPorts, a)).toHaveLength(0);
  });

  it('lists unmatched connected ports for Settings inventory', () => {
    const odd: MidiPortInfo[] = [
      ...ports.filter((p) => !p.name.includes('FM1') && !p.name.includes('MPC')),
      { id: 'mystery-in', name: 'IAC Driver Bus 1', type: 'input', state: 'connected' },
      { id: 'mystery-out', name: 'IAC Driver Bus 1', type: 'output', state: 'connected' },
    ];
    const a = matchPortsToRoles(odd);
    const um = unmatchedConnectedPorts(odd, a);
    expect(um.map((p) => p.id).sort()).toEqual(['mystery-in', 'mystery-out']);
    expect(roleUsingPort(a, 'c-in')).toBe('circuit');
    expect(roleUsingPort(a, 'mystery-in')).toBeNull();
    expect(a.find((x) => x.roleId === 'mpc')?.connected).toBe(false);
    expect(a.find((x) => x.roleId === 'fm1')?.connected).toBe(false);
  });
});

describe('My Studio routing restore', () => {
  it('builds track plan with USB channel remaps (avoids thru-box doubles)', () => {
    const routes = buildMyStudioRoutes({
      circuitIn: 'c-in',
      mpcOut: 'm-out',
      spOut: 's-out',
      fm1Out: 'f-out',
    });
    expect(routes).toHaveLength(6);
    expect(routes.every((r) => r.forwardClock !== true)).toBe(true);
    expect(routes.find((r) => r.id === 'mystudio-t1-mpc')?.channel).toEqual({
      allow: [1],
      remap: { 1: 9 },
    });
    expect(routes.find((r) => r.id === 'mystudio-t4-mpc')?.channel).toEqual({
      allow: [4],
      remap: { 4: 12 },
    });
    expect(routes.find((r) => r.id === 'mystudio-t5-fm1')?.channel).toEqual({
      allow: [5],
      remap: { 5: 5 },
    });
    expect(routes.find((r) => r.id === 'mystudio-t6-sp')?.channel).toEqual({
      allow: [6],
      remap: { 6: 13 },
    });
    expect(routes.some((r) => r.id.includes('t7'))).toBe(false);
  });

  it('rebinds template placeholders to real ports', () => {
    const template = myStudioTemplateRoutes();
    const rebound = rebindRoutesToAssignments(template, {
      circuitIn: 'c-in',
      mpcOut: 'm-out',
      spOut: 's-out',
      fm1Out: 'f-out',
    });
    expect(rebound[0]!.sourcePortId).toBe('c-in');
    expect(portsForRoles(matchPortsToRoles(ports)).circuitIn).toBe('c-in');
  });
});

describe('Section Bridge', () => {
  it('maps instant and queued project PGM on remapped control channels', () => {
    expect(MPC_MUTE_LEARN_CHANNEL).toBe(15);
    expect(MPC_CONTROL_CHANNEL).toBe(15);
    expect(SP_PATTERN_PC_CHANNEL).toBe(13);

    const instant = resolveSectionBridge(0, DEFAULT_SECTION_BRIDGE)!;
    expect(instant.projectIndex).toBe(1);
    expect(instant.kind).toBe('instant');
    const sp = instant.outbound.find((o) => o.portRole === 'sp404')!;
    const mpc = instant.outbound.find((o) => o.portRole === 'mpc')!;
    expect(sp.data[0]).toBe(0xc0 | (SP_PATTERN_PC_CHANNEL - 1)); // ch13
    expect(mpc.data[0]).toBe(0xc0 | (MPC_CONTROL_CHANNEL - 1)); // ch15
    // Never emit PC on musical 1–8 or Circuit project 16
    for (const o of instant.outbound) {
      const ch = (o.data[0]! & 0x0f) + 1;
      expect(ch === 16 || (ch >= 1 && ch <= 8)).toBe(false);
    }

    const queued = resolveSectionBridge(65, {
      enabled: true,
      rows: [{ projectIndex: 2, spProgramChange: 3, mpcProgramChange: 4, sceneId: 'sc' }],
    })!;
    expect(queued.kind).toBe('queued');
    expect(queued.projectIndex).toBe(2);
    expect(queued.sceneId).toBe('sc');
  });

  it('does nothing when disabled', () => {
    expect(resolveSectionBridge(0, { ...DEFAULT_SECTION_BRIDGE, enabled: false })).toBeNull();
  });
});
