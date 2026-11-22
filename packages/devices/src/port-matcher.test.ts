import { describe, it, expect } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import { matchPortsToRoles, assignPort, portsForRoles } from './port-matcher';
import {
  buildMyStudioRoutes,
  myStudioTemplateRoutes,
  rebindRoutesToAssignments,
} from './studio-layout';
import { resolveSectionBridge, DEFAULT_SECTION_BRIDGE } from './section-bridge';

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
  it('builds track plan without clock by default', () => {
    const routes = buildMyStudioRoutes({
      circuitIn: 'c-in',
      mpcOut: 'm-out',
      spOut: 's-out',
      fm1Out: 'f-out',
    });
    expect(routes).toHaveLength(6);
    expect(routes.every((r) => r.forwardClock !== true)).toBe(true);
    expect(routes.find((r) => r.id === 'mystudio-t5-fm1')?.channel?.allow).toEqual([5]);
    expect(routes.find((r) => r.id === 'mystudio-t6-sp')?.channel?.allow).toEqual([6]);
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
  it('maps instant and queued project PGM', () => {
    const instant = resolveSectionBridge(0, DEFAULT_SECTION_BRIDGE)!;
    expect(instant.projectIndex).toBe(1);
    expect(instant.kind).toBe('instant');
    expect(instant.outbound.some((o) => o.portRole === 'sp404')).toBe(true);

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
