import type { DeviceId, MusicalRole, RoleBinding } from '@dawlessdaw/core';
import type { MidiRoute } from '@dawlessdaw/routing';
import { DEFAULT_TRACK_CHANNELS, PROJECT_MIDI_CHANNEL } from './midi-map';

export type CircuitArrangerMode = 'direct-sequencing' | 'observe-only';

export interface CircuitDestinationPorts {
  spOut?: string;
  mpcOut?: string;
  fm1Out?: string;
}

export interface ProjectSceneMapEntry {
  projectIndex: number; // 1–64
  sceneId: string;
}

export interface CircuitArrangerProfile {
  mode: CircuitArrangerMode;
  circuitDeviceId: DeviceId;
  circuitInputPortId: string;
  channelMap: Readonly<Record<number, number>>;
  destinations: CircuitDestinationPorts;
  /** When Project PGM observed, recall these Dawlessdaw scenes (optional). */
  projectSceneMap: ProjectSceneMapEntry[];
  clockToAllExternal: boolean;
}

const TRACK_ROLES: { track: number; role: MusicalRole; label: string }[] = [
  { track: 1, role: 'drums', label: 'Track 1 Drums' },
  { track: 2, role: 'drums', label: 'Track 2 Drums' },
  { track: 3, role: 'sample', label: 'Track 3 Sample' },
  { track: 4, role: 'sample', label: 'Track 4 Sample' },
  { track: 5, role: 'bass', label: 'Track 5 Bass' },
  { track: 6, role: 'keys', label: 'Track 6 Keys' },
  { track: 7, role: 'lead', label: 'Track 7 Lead' },
  { track: 8, role: 'fx', label: 'Track 8 FX' },
];

export function defaultCircuitArrangerProfile(
  circuitDeviceId: DeviceId,
  circuitInputPortId: string,
  destinations: CircuitDestinationPorts,
): CircuitArrangerProfile {
  return {
    mode: 'direct-sequencing',
    circuitDeviceId,
    circuitInputPortId,
    channelMap: DEFAULT_TRACK_CHANNELS,
    destinations,
    projectSceneMap: [],
    clockToAllExternal: true,
  };
}

/**
 * Build Dawlessdaw routes for Circuit-as-arranger (approach A: direct sequencing).
 * Does not invent Scene Sync — Project PGM is handled separately as observation.
 */
export function buildDirectSequencingRoutes(profile: CircuitArrangerProfile): MidiRoute[] {
  if (profile.mode !== 'direct-sequencing') return [];

  const routes: MidiRoute[] = [];

  for (const binding of TRACK_ROLES) {
    const channel = profile.channelMap[binding.track] ?? binding.track;
    const destPorts = destPortsForRole(binding.role, profile.destinations);
    if (!destPorts.length) continue;

    routes.push({
      id: `circuit-arranger-t${binding.track}`,
      name: `Circuit T${binding.track} ${binding.role} → external`,
      enabled: true,
      sourcePortId: profile.circuitInputPortId,
      destinations: destPorts.map((portId) => ({ portId })),
      channel: { allow: [channel] },
      forwardClock: false,
      blockKinds: ['program-change'],
    });
  }

  if (profile.clockToAllExternal) {
    const clockDests = unique([
      profile.destinations.spOut,
      profile.destinations.mpcOut,
      profile.destinations.fm1Out,
    ]);
    if (clockDests.length) {
      routes.push({
        id: 'circuit-arranger-clock',
        name: 'Circuit clock → externals',
        enabled: true,
        sourcePortId: profile.circuitInputPortId,
        destinations: clockDests.map((portId) => ({ portId })),
        forwardClock: true,
        // Allow clock/start/stop/continue/SPP; block channel voice + SysEx.
        blockKinds: [
          'note-on',
          'note-off',
          'cc',
          'program-change',
          'aftertouch',
          'pitch-bend',
          'sysex',
          'unknown',
        ],
      });
    }
  }

  return routes;
}

export function enrichRoleBindings(
  circuitDeviceId: DeviceId,
  destinations: CircuitDestinationPorts,
  deviceIds: { sp?: DeviceId; mpc?: DeviceId; fm1?: DeviceId },
): RoleBinding[] {
  return TRACK_ROLES.map((t) => {
    const base: RoleBinding = {
      roleId: `circuit-t${t.track}`,
      role: t.role,
      label: t.label,
      sourceDeviceId: circuitDeviceId,
      sourceTrack: t.track,
      sourceChannel: DEFAULT_TRACK_CHANNELS[t.track],
      destinationDeviceIds: [],
      destinationPortIds: [],
    };
    const ports = destPortsForRole(t.role, destinations);
    if (!ports.length) return base;
    let destDevice: DeviceId | undefined;
    if (t.role === 'drums' || t.role === 'sample' || t.role === 'fx') destDevice = deviceIds.sp;
    else if (t.role === 'bass') destDevice = deviceIds.mpc;
    else destDevice = deviceIds.fm1;
    return {
      ...base,
      destinationDeviceIds: destDevice ? [destDevice] : [],
      destinationPortIds: ports,
    };
  });
}

export function resolveSceneForProject(
  map: ProjectSceneMapEntry[],
  projectIndex: number,
): string | null {
  return map.find((e) => e.projectIndex === projectIndex)?.sceneId ?? null;
}

export { PROJECT_MIDI_CHANNEL };

function destPortsForRole(role: MusicalRole, d: CircuitDestinationPorts): string[] {
  switch (role) {
    case 'drums':
    case 'sample':
    case 'fx':
      return d.spOut ? [d.spOut] : [];
    case 'bass':
      return d.mpcOut ? [d.mpcOut] : [];
    case 'keys':
    case 'lead':
    case 'pad':
      return d.fm1Out ? [d.fm1Out] : [];
    default:
      return [];
  }
}

function unique(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}
