/** Capability honesty statuses — never invent verified features. */
export type CapabilityStatus =
  | 'verified'
  | 'untested'
  | 'experimental'
  | 'unavailable'
  | 'unknown';

export type DeviceKind =
  | 'mpc-one'
  | 'sp404mkii'
  | 'circuit-rhythm'
  | 'm-vave-fm1'
  | 'zed-10fx'
  | 'generic-midi';

export type DeviceId = string;
export type PortId = string;
export type RouteId = string;
export type SceneId = string;
export type SessionId = string;
export type RoleId = string;

export interface MidiPortInfo {
  id: PortId;
  name: string;
  manufacturer?: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
}

export interface DeviceCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  notes?: string;
}

export interface DeviceProfile {
  kind: DeviceKind;
  displayName: string;
  manufacturer: string;
  /** Match Web MIDI port name fragments (case-insensitive). */
  portNameHints: string[];
  hasMidi: boolean;
  hasAudioCapture: boolean;
  capabilities: DeviceCapability[];
  /** Optional firmware / OS profile key (e.g. stock vs doom). */
  firmwareProfiles?: string[];
  defaultFirmwareProfile?: string;
}

export interface StudioDevice {
  id: DeviceId;
  kind: DeviceKind;
  displayName: string;
  inputPortIds: PortId[];
  outputPortIds: PortId[];
  connected: boolean;
  firmwareProfile?: string;
  capabilities: DeviceCapability[];
  /** ZED and similar: audio-only, no MIDI. */
  midiEnabled: boolean;
}

export type MidiMessageKind =
  | 'note-on'
  | 'note-off'
  | 'cc'
  | 'program-change'
  | 'clock'
  | 'start'
  | 'stop'
  | 'continue'
  | 'song-position'
  | 'sysex'
  | 'aftertouch'
  | 'pitch-bend'
  | 'unknown';

export interface MidiMessage {
  data: Uint8Array;
  timestamp: number;
  portId: PortId;
  channel?: number; // 1–16 when applicable
  kind: MidiMessageKind;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
}

export type FocusMode = 'follow' | 'smart' | 'manual';

export interface SoftFocus {
  deviceId: DeviceId;
  until: number;
}

export interface FocusState {
  mode: FocusMode;
  activeDeviceId: DeviceId | null;
  pinnedDeviceId: DeviceId | null;
  softFocus: SoftFocus | null;
  lastChangeAt: number;
}

/** Logical musical roles (Circuit tracks → roles → destinations). */
export type MusicalRole =
  | 'drums'
  | 'bass'
  | 'keys'
  | 'lead'
  | 'pad'
  | 'fx'
  | 'vocals'
  | 'sample'
  | 'utility';

export interface RoleBinding {
  roleId: RoleId;
  role: MusicalRole;
  label: string;
  /** Source device + track/channel identity */
  sourceDeviceId: DeviceId;
  sourceTrack?: number;
  sourceChannel?: number;
  destinationDeviceIds: DeviceId[];
  destinationPortIds: PortId[];
}

export const SCHEMA_VERSION = 1 as const;
