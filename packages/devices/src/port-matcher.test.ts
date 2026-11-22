import { describe, it, expect } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import { matchPortsToRoles, assignPort, portsForRoles } from './port-matcher';
import {
  buildMyStudioRoutes,
  myStudioTemplateRoutes,
  rebindRoutesToAssignments,
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
