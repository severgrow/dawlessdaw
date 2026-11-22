import type { MidiPortInfo } from '@dawlessdaw/core';
import {
  MY_STUDIO_ROLES,
  type PortAssignment,
  type StudioRoleDef,
  type StudioRoleId,
} from './studio-layout';

/** Lowercase alphanumerics only — bridges "M-VAVE" ↔ "mvave", "MPC-One" ↔ "mpcone". */
function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Treat UI / localStorage empties as null so a persisted "—" / "" never blocks auto-match.
 * Mock transport ids are cleared on Live sync so sim leftovers cannot sticky-claim slots.
 */
export function normalizePortId(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  if (!t) return null;
  if (t === '-' || t === '—' || t === '–' || t === '−') return null;
  if (t.startsWith('mock-') || t.startsWith('__missing_') || t.startsWith('__')) return null;
  return t;
}

/**
 * Score how well a port name/manufacturer matches role hints.
 * Supports contiguous substring, compact (hyphen/space-insensitive), and
 * multi-token hints so "akai mpc" matches "Akai Professional MPC One".
 */
export function scorePortAgainstHints(
  port: Pick<MidiPortInfo, 'name' | 'manufacturer'>,
  hints: string[],
): number {
  const haystacks = [port.name, port.manufacturer ?? ''].filter(Boolean);
  let best = 0;
  for (const raw of haystacks) {
    const n = raw.toLowerCase();
    const nCompact = compact(raw);
    const nTokens = new Set(tokens(raw));
    for (const h of hints) {
      const hl = h.toLowerCase().trim();
      if (!hl) continue;
      const hCompact = compact(hl);
      const hTokens = tokens(hl);
      // Bare short alphanumerics (e.g. "h1"): exact compact / whole-token only.
      // Hyphenated forms like "h-1" keep normal includes matching.
      if (hl.length < 3 && /^[a-z0-9]+$/.test(hl)) {
        if (nCompact === hCompact || nTokens.has(hl) || nTokens.has(hCompact)) {
          best = Math.max(best, hCompact.length || hl.length);
        }
        continue;
      }
      if (n.includes(hl)) {
        best = Math.max(best, hCompact.length || hl.length);
        continue;
      }
      if (hCompact.length >= 3 && nCompact.includes(hCompact)) {
        best = Math.max(best, hCompact.length);
        continue;
      }
      // Compact equality for hyphenated shorts ("h-1" ↔ name "H1").
      if (hCompact.length >= 2 && nCompact === hCompact) {
        best = Math.max(best, hCompact.length);
        continue;
      }
      // All hint tokens present as whole words (order-independent).
      // Require every token length ≥ 2 so a lone "m" cannot false-hit.
      if (
        hTokens.length > 1 &&
        hTokens.every((t) => t.length >= 2) &&
        hTokens.every((t) => nTokens.has(t))
      ) {
        best = Math.max(best, hCompact.length);
      }
    }
  }
  return best;
}

function scoreName(name: string, hints: string[]): number {
  return scorePortAgainstHints({ name }, hints);
}

/** Strong exclusive hints — used to keep weak FM1 CDC names off Circuit/MPC/SP. */
function exclusiveHintsForRole(role: StudioRoleDef): string[] {
  switch (role.id) {
    case 'circuit':
      return ['circuit', 'novation'];
    case 'mpc':
      return ['mpc', 'akai'];
    case 'sp404':
      return ['sp404', 'sp-404', '404mkii', '404'];
    case 'fm1':
      return [
        'fm1',
        'fm-1',
        'felucca',
        'h-1',
        'h1',
        'mvave',
        'm-vave',
        'mvav',
        'ch345',
        'wch',
      ];
    default:
      return role.portNameHints;
  }
}

function isClaimedByStrongerRole(
  port: MidiPortInfo,
  candidateRole: StudioRoleDef,
  allRoles: StudioRoleDef[],
): boolean {
  const self = scorePortAgainstHints(port, exclusiveHintsForRole(candidateRole));
  for (const other of allRoles) {
    if (other.id === candidateRole.id || !other.midi) continue;
    // Only protect earlier (more specific) studio roles from later weak claims.
    const otherIdx = allRoles.findIndex((r) => r.id === other.id);
    const selfIdx = allRoles.findIndex((r) => r.id === candidateRole.id);
    if (otherIdx > selfIdx) continue;
    const otherScore = scorePortAgainstHints(port, exclusiveHintsForRole(other));
    if (otherScore > 0 && otherScore >= self) return true;
  }
  return false;
}

/** Find a manually picked port: same id if still present, else exact same name. */
function findManualPort(
  candidates: MidiPortInfo[],
  used: Set<string>,
  id: string | null | undefined,
  name: string | null | undefined,
): MidiPortInfo | null {
  const wantId = normalizePortId(id);
  const byId = wantId ? candidates.find((p) => p.id === wantId && !used.has(p.id)) : undefined;
  if (byId) return byId;
  if (!name) return null;
  return candidates.find((p) => p.name === name && !used.has(p.id)) ?? null;
}

function rankPortsForRole(
  candidates: MidiPortInfo[],
  used: Set<string>,
  role: StudioRoleDef,
  midiRoles: StudioRoleDef[],
  hints: string[],
): MidiPortInfo | undefined {
  const ranked = [...candidates]
    .filter((p) => !used.has(p.id))
    .filter((p) => !isClaimedByStrongerRole(p, role, midiRoles))
    .map((p) => ({ p, s: scorePortAgainstHints(p, hints) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.p;
}

/**
 * Auto-match Web MIDI ports to studio roles by name hints.
 * Preserves manual overrides when `previous` has port ids still present.
 * Empty / dash / mock previous slots never lock a role — strong hints (e.g. Felucca → FM1)
 * still bind on Live sync when those ports are unmatched.
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
  const midiRoles = MY_STUDIO_ROLES.filter((r) => r.midi);

  // Manual picks first: find the port by id, else by the remembered name (ids can
  // change between sessions). Reserve them so auto-matching can never take them.
  const manualIn = new Map<StudioRoleId, MidiPortInfo | null>();
  const manualOut = new Map<StudioRoleId, MidiPortInfo | null>();
  for (const role of midiRoles) {
    const prev = prevByRole.get(role.id);
    if (prev?.inputManual) {
      const hit = findManualPort(inputs, usedIn, prev.inputPortId, prev.inputPortName);
      if (hit) usedIn.add(hit.id);
      manualIn.set(role.id, hit);
    }
    if (prev?.outputManual) {
      const hit = findManualPort(outputs, usedOut, prev.outputPortId, prev.outputPortName);
      if (hit) usedOut.add(hit.id);
      manualOut.set(role.id, hit);
    }
  }

  const assignments: PortAssignment[] = MY_STUDIO_ROLES.map((role) => {
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

    const inManual = manualIn.has(role.id);
    const outManual = manualOut.has(role.id);

    // Honour previous auto matches if ports still exist (normalize empties / mock ids first)
    let inputPortId = inManual
      ? (manualIn.get(role.id)?.id ?? null)
      : normalizePortId(prev?.inputPortId);
    let outputPortId = outManual
      ? (manualOut.get(role.id)?.id ?? null)
      : normalizePortId(prev?.outputPortId);
    if (!inManual && inputPortId && (!inputs.some((p) => p.id === inputPortId) || usedIn.has(inputPortId)))
      inputPortId = null;
    if (!outManual && outputPortId && (!outputs.some((p) => p.id === outputPortId) || usedOut.has(outputPortId)))
      outputPortId = null;

    // A manual slot whose port is unplugged stays empty until it comes back.
    if (!inputPortId && !inManual) {
      inputPortId = rankPortsForRole(inputs, usedIn, role, midiRoles, role.portNameHints)?.id ?? null;
    }
    if (!outputPortId && !outManual) {
      outputPortId =
        rankPortsForRole(outputs, usedOut, role, midiRoles, role.portNameHints)?.id ?? null;
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
      // Manual slots keep the remembered name while unplugged, so they can re-bind.
      inputPortName: inPort?.name ?? (inManual ? (prev?.inputPortName ?? null) : null),
      outputPortName: outPort?.name ?? (outManual ? (prev?.outputPortName ?? null) : null),
      connected: connectedNow,
      ...(inManual ? { inputManual: true } : {}),
      ...(outManual ? { outputManual: true } : {}),
    };
  });

  // Second pass: empty roles reclaim unmatched ports via exclusive (strong) hints.
  // Covers Felucca → FM1 when a prior localStorage row left FM1 as "—" / null.
  for (const role of midiRoles) {
    const a = assignments.find((x) => x.roleId === role.id);
    if (!a) continue;
    const exclusive = exclusiveHintsForRole(role);
    if (!a.inputPortId && !a.inputManual) {
      const hit = rankPortsForRole(inputs, usedIn, role, midiRoles, exclusive);
      if (hit) {
        a.inputPortId = hit.id;
        a.inputPortName = hit.name;
        usedIn.add(hit.id);
      }
    }
    if (!a.outputPortId && !a.outputManual) {
      const hit = rankPortsForRole(outputs, usedOut, role, midiRoles, exclusive);
      if (hit) {
        a.outputPortId = hit.id;
        a.outputPortName = hit.name;
        usedOut.add(hit.id);
      }
    }
    a.connected = Boolean(a.inputPortId || a.outputPortId);
    if (a.inputPortId) {
      a.inputPortName = inputs.find((p) => p.id === a.inputPortId)?.name ?? a.inputPortName ?? null;
    }
    if (a.outputPortId) {
      a.outputPortName =
        outputs.find((p) => p.id === a.outputPortId)?.name ?? a.outputPortName ?? null;
    }
  }

  return assignments;
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
        return {
          ...a,
          inputPortId: null,
          inputPortName: null,
          inputManual: false,
          connected: Boolean(a.outputPortId),
        };
      }
      if (which === 'output' && portId && a.outputPortId === portId) {
        return {
          ...a,
          outputPortId: null,
          outputPortName: null,
          outputManual: false,
          connected: Boolean(a.inputPortId),
        };
      }
      return a;
    }
    const port = ports.find((p) => p.id === portId);
    if (which === 'input') {
      return {
        ...a,
        inputPortId: portId,
        inputPortName: port?.name ?? null,
        // Picking a port pins it; picking "—" hands the slot back to auto-matching.
        inputManual: Boolean(portId),
        connected: Boolean(portId || a.outputPortId),
      };
    }
    return {
      ...a,
      outputPortId: portId,
      outputPortName: port?.name ?? null,
      outputManual: Boolean(portId),
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

/** Which studio role currently uses this port id (if any). */
export function roleUsingPort(
  assignments: PortAssignment[],
  portId: string,
): StudioRoleId | null {
  for (const a of assignments) {
    if (a.inputPortId === portId || a.outputPortId === portId) return a.roleId;
  }
  return null;
}

/** Connected MIDI ports that no studio role has claimed — for Settings inventory. */
export function unmatchedConnectedPorts(
  ports: MidiPortInfo[],
  assignments: PortAssignment[],
): MidiPortInfo[] {
  const claimed = new Set<string>();
  for (const a of assignments) {
    if (a.inputPortId) claimed.add(a.inputPortId);
    if (a.outputPortId) claimed.add(a.outputPortId);
  }
  return ports.filter((p) => p.state === 'connected' && !claimed.has(p.id));
}

/**
 * USB-MIDI interfaces that can drive an MPC DIN In (clock works).
 * The Akai MPC USB-B port itself does NOT accept MIDI Clock from a host.
 */
export function looksLikeMidiInterfaceOut(name: string | null | undefined): boolean {
  if (!name) return false;
  return /scarlett|focusrite|2i[24]|4i4|8i6|18i|mio\b|esi\b|motu|um.?one|umone|midisport|usb.?midi|interface/i.test(
    name,
  );
}

/** Port name looks like the MPC's own USB class-compliant port (clock will not start the sequencer). */
export function looksLikeAkaiMpcUsbPort(name: string | null | undefined): boolean {
  if (!name) return false;
  if (looksLikeMidiInterfaceOut(name)) return false;
  return /\bmpc\b|akai/i.test(name);
}

/**
 * Advice for the MPC Out slot when using "MPC follows Circuit Play".
 * Prefer a Scarlett / interface → DIN cable; never rely on MPC USB for clock.
 */
export function mpcClockPortAdvice(outputPortName: string | null | undefined): {
  kind: 'ok-interface' | 'warn-akai-usb' | 'unset' | 'unknown';
  message: string;
} {
  if (!outputPortName) {
    return {
      kind: 'unset',
      message:
        'Pick the Scarlett (or any USB-MIDI interface) as MPC Out — not the “MPC One” USB port. Cable that interface’s MIDI Out → MPC MIDI In (DIN / 3.5 mm).',
    };
  }
  if (looksLikeAkaiMpcUsbPort(outputPortName)) {
    return {
      kind: 'warn-akai-usb',
      message: `“${outputPortName}” looks like the MPC USB port. Akai USB-B does not accept MIDI Clock from a computer — the sequencer will not start. Switch MPC Out to Scarlett / a MIDI interface whose DIN Out feeds the MPC MIDI In.`,
    };
  }
  if (looksLikeMidiInterfaceOut(outputPortName)) {
    return {
      kind: 'ok-interface',
      message: `MPC Out = “${outputPortName}” — good for clock: interface MIDI Out → MPC MIDI In. Notes (ch9–12) and transport share this port but use separate routes.`,
    };
  }
  return {
    kind: 'unknown',
    message: `MPC Out = “${outputPortName}”. For sequencer follow, this must reach the MPC over DIN (not Akai USB-B). Confirm the cable goes interface MIDI Out → MPC MIDI In.`,
  };
}

// Re-export for tests that still call the old private helper shape
export { scoreName };
