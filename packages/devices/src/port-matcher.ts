import type { MidiPortInfo } from '@dawlessdaw/core';
import {
  MY_STUDIO_ROLES,
  type PortAssignment,
  type StudioRoleId,
} from './studio-layout';

function scoreName(name: string, hints: string[]): number {
  const n = name.toLowerCase();
  let best = 0;
  for (const h of hints) {
    if (n.includes(h.toLowerCase())) best = Math.max(best, h.length);
  }
  return best;
}

/**
 * Auto-match Web MIDI ports to studio roles by name hints.
 * Preserves manual overrides when `previous` has port ids still present.
 */
export function matchPortsToRoles(
  ports: MidiPortInfo[],
  previous: PortAssignment[] = [],
): PortAssignment[] {
  const connected = ports.filter((p) => p.state === 'connected');
  const inputs = connected.filter((p) => p.type === 'input');
  const outputs = connected.filter((p) => p.type === 'output');
  const usedIn = new Set<string>();
  const usedOut = new Set<string>();

  const prevByRole = new Map(previous.map((a) => [a.roleId, a]));

  return MY_STUDIO_ROLES.map((role) => {
    const prev = prevByRole.get(role.id);
    if (!role.midi) {
      return {
        roleId: role.id,
        inputPortId: null,
        outputPortId: null,
        connected: true, // audio-only member always "present" in studio
        inputPortName: null,
        outputPortName: null,
      };
    }

    // Honour manual / previous if ports still exist
    let inputPortId = prev?.inputPortId ?? null;
    let outputPortId = prev?.outputPortId ?? null;
    if (inputPortId && !inputs.some((p) => p.id === inputPortId)) inputPortId = null;
    if (outputPortId && !outputs.some((p) => p.id === outputPortId)) outputPortId = null;

    if (!inputPortId) {
      const ranked = [...inputs]
        .filter((p) => !usedIn.has(p.id))
        .map((p) => ({ p, s: scoreName(p.name, role.portNameHints) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      inputPortId = ranked[0]?.p.id ?? null;
    }
    if (!outputPortId) {
      const ranked = [...outputs]
        .filter((p) => !usedOut.has(p.id))
        .map((p) => ({ p, s: scoreName(p.name, role.portNameHints) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      outputPortId = ranked[0]?.p.id ?? null;
    }

    if (inputPortId) usedIn.add(inputPortId);
    if (outputPortId) usedOut.add(outputPortId);

    const inPort = inputs.find((p) => p.id === inputPortId);
    const outPort = outputs.find((p) => p.id === outputPortId);
    const connectedNow = Boolean(inputPortId || outputPortId);

    return {
      roleId: role.id,
      inputPortId,
      outputPortId,
      inputPortName: inPort?.name ?? prev?.inputPortName ?? null,
      outputPortName: outPort?.name ?? prev?.outputPortName ?? null,
      connected: connectedNow,
    };
  });
}

export function assignPort(
  assignments: PortAssignment[],
  roleId: StudioRoleId,
  which: 'input' | 'output',
  portId: string | null,
  ports: MidiPortInfo[],
): PortAssignment[] {
  return assignments.map((a) => {
    if (a.roleId !== roleId) {
      // Clear duplicate use of same port on other roles
      if (which === 'input' && portId && a.inputPortId === portId) {
        return { ...a, inputPortId: null, inputPortName: null, connected: Boolean(a.outputPortId) };
      }
      if (which === 'output' && portId && a.outputPortId === portId) {
        return { ...a, outputPortId: null, outputPortName: null, connected: Boolean(a.inputPortId) };
      }
      return a;
    }
    const port = ports.find((p) => p.id === portId);
    if (which === 'input') {
      return {
        ...a,
        inputPortId: portId,
        inputPortName: port?.name ?? null,
        connected: Boolean(portId || a.outputPortId),
      };
    }
    return {
      ...a,
      outputPortId: portId,
      outputPortName: port?.name ?? null,
      connected: Boolean(a.inputPortId || portId),
    };
  });
}

export function portsForRoles(assignments: PortAssignment[]): {
  circuitIn: string | null;
  mpcOut: string | null;
  spOut: string | null;
  fm1Out: string | null;
  mpcIn: string | null;
  spIn: string | null;
  fm1In: string | null;
} {
  const get = (id: StudioRoleId) => assignments.find((a) => a.roleId === id);
  return {
    circuitIn: get('circuit')?.inputPortId ?? null,
    mpcOut: get('mpc')?.outputPortId ?? null,
    spOut: get('sp404')?.outputPortId ?? null,
    fm1Out: get('fm1')?.outputPortId ?? null,
    mpcIn: get('mpc')?.inputPortId ?? null,
    spIn: get('sp404')?.inputPortId ?? null,
    fm1In: get('fm1')?.inputPortId ?? null,
  };
}
