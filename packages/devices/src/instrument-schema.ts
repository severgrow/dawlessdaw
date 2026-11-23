/**
 * Universal Instrument schema draft (plan step 13 / Phase B3).
 *
 * Additive only — does not replace DeviceProfile, GenericDeviceProfile,
 * ControllerPreset, StudioRole, or localStorage keys. Live routing still
 * owns MidiRoute / forwardClock. No SysEx. No GPL (Zynthian chain idea =
 * REIMPLEMENT concept only).
 *
 * Future: StudioRuntime may project instruments ↔ routes; this PR is types +
 * adapters + validation only.
 */

import type { DeviceCapability, DeviceKind, DeviceProfile, PortId } from '@dawlessdaw/core';
import type { CtrlDevice } from './controller';
import type { GenericDeviceProfile, ProfileHonesty } from './generic-profile';
import type { StudioRoleDef, StudioRoleId } from './studio-layout';
import { MY_STUDIO_ROLES } from './studio-layout';
import { DEVICE_PROFILES } from './profiles';

/** Bump only with a migration path; importers reject unknown versions. */
export const INSTRUMENT_SCHEMA_VERSION = 1 as const;

export type InstrumentId = string;
export type InstrumentChainId = string;

export type InstrumentHonesty = ProfileHonesty | 'builtin';

export type MidiPortRole = 'in' | 'out';
export type AudioPortRole = 'in' | 'out' | 'bus';

/** Logical MIDI port on an instrument (multi-port ready). */
export interface InstrumentMidiPort {
  id: string;
  role: MidiPortRole;
  /** Remembered Web MIDI name fragment — ids change between sessions. */
  hintName?: string;
  /** Live binding when known; optional in drafts. */
  portId?: PortId;
  label?: string;
}

/**
 * Logical audio port / bus ref.
 * Never auto-select MacBook / iPhone / Continuity mics (enforced at pickers, not here).
 */
export interface InstrumentAudioPort {
  id: string;
  role: AudioPortRole;
  label?: string;
  /** MediaDevices deviceId when bound — leave unset in schema drafts. */
  deviceId?: string;
  channels?: number;
}

export interface InstrumentMidi {
  enabled: boolean;
  /** Default channel 1–16 when applicable. */
  channel?: number;
  ports: InstrumentMidiPort[];
}

export interface InstrumentAudio {
  enabled: boolean;
  ports: InstrumentAudioPort[];
}

/**
 * Links back to existing models so we can migrate carefully without renames.
 * All fields optional — presence is documentation for adapters.
 */
export interface InstrumentProvenance {
  deviceProfileKey?: string;
  deviceKind?: DeviceKind | string;
  genericProfileId?: string;
  studioRoleId?: StudioRoleId;
  controllerDevice?: CtrlDevice;
}

/**
 * Unified Instrument — MIDI ± audio, multi-port.
 * Zynthian-inspired: one musical object that can sit in a chain later.
 */
export interface Instrument {
  schemaVersion: typeof INSTRUMENT_SCHEMA_VERSION;
  id: InstrumentId;
  displayName: string;
  manufacturer?: string;
  /** Stable kind string (DeviceKind or generic category). */
  kind: string;
  honesty: InstrumentHonesty;
  midi: InstrumentMidi;
  audio: InstrumentAudio;
  capabilities?: DeviceCapability[];
  provenance?: InstrumentProvenance;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Stage role in a signal chain (concept from Zynthian chains — reimplemented). */
export type ChainStageRole = 'source' | 'fx' | 'destination' | 'monitor';

export interface ChainStage {
  id: string;
  role: ChainStageRole;
  instrumentId: InstrumentId;
  /** Optional MIDI channel for this hop (1–16). */
  midiChannel?: number;
  /** Optional named audio bus (step 15 mixer model will flesh this out). */
  audioBus?: string;
}

/**
 * Ordered instrument chain — schema only; does not enable clock forward
 * or rewrite MidiRoute. Runtime wiring is a later step.
 */
export interface InstrumentChain {
  schemaVersion: typeof INSTRUMENT_SCHEMA_VERSION;
  id: InstrumentChainId;
  name: string;
  stages: ChainStage[];
  notes?: string;
}

export interface InstrumentBundle {
  schemaVersion: typeof INSTRUMENT_SCHEMA_VERSION;
  kind: 'splot-instruments';
  instruments: Instrument[];
  chains: InstrumentChain[];
  exportedAt: number;
}

export interface InstrumentParseResult {
  ok: boolean;
  instrument?: Instrument;
  errors: string[];
}

export interface InstrumentBundleParseResult {
  ok: boolean;
  bundle?: InstrumentBundle;
  errors: string[];
}

const HONESTY_SET = new Set<string>(['generic', 'documented', 'verified', 'builtin']);
const STAGE_ROLE_SET = new Set<string>(['source', 'fx', 'destination', 'monitor']);
const MIDI_ROLE_SET = new Set<string>(['in', 'out']);
const AUDIO_ROLE_SET = new Set<string>(['in', 'out', 'bus']);
const ID_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Validate a single Instrument (strict enough for import; additive fields OK). */
export function parseInstrument(raw: unknown): InstrumentParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['instrument must be an object'] };
  }
  if (raw.schemaVersion !== INSTRUMENT_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion (want ${INSTRUMENT_SCHEMA_VERSION})`);
  }
  const id = asString(raw.id);
  if (!id || !ID_SAFE.test(id)) errors.push('id missing or unsafe');
  const displayName = asString(raw.displayName)?.trim();
  if (!displayName) errors.push('displayName required');
  const kind = asString(raw.kind)?.trim();
  if (!kind) errors.push('kind required');
  const honesty = asString(raw.honesty);
  if (!honesty || !HONESTY_SET.has(honesty)) {
    errors.push('honesty must be generic|documented|verified|builtin');
  }

  const midiRaw = isPlainObject(raw.midi) ? raw.midi : null;
  const audioRaw = isPlainObject(raw.audio) ? raw.audio : null;
  if (!midiRaw || typeof midiRaw.enabled !== 'boolean') {
    errors.push('midi.enabled boolean required');
  }
  if (!audioRaw || typeof audioRaw.enabled !== 'boolean') {
    errors.push('audio.enabled boolean required');
  }

  const midiPorts = midiRaw && Array.isArray(midiRaw.ports) ? midiRaw.ports : [];
  const audioPorts = audioRaw && Array.isArray(audioRaw.ports) ? audioRaw.ports : [];
  for (const p of midiPorts) {
    if (!isPlainObject(p) || !asString(p.id) || !MIDI_ROLE_SET.has(String(p.role))) {
      errors.push('midi.ports entries need id + role in|out');
      break;
    }
  }
  for (const p of audioPorts) {
    if (!isPlainObject(p) || !asString(p.id) || !AUDIO_ROLE_SET.has(String(p.role))) {
      errors.push('audio.ports entries need id + role in|out|bus');
      break;
    }
  }

  const channel = midiRaw ? asNumber(midiRaw.channel) : undefined;
  if (channel != null && (channel < 1 || channel > 16 || !Number.isInteger(channel))) {
    errors.push('midi.channel must be integer 1–16 when set');
  }

  if (errors.length || !midiRaw || !audioRaw) return { ok: false, errors };

  const instrument: Instrument = {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    id: id!,
    displayName: displayName!,
    manufacturer: asString(raw.manufacturer),
    kind: kind!,
    honesty: honesty as InstrumentHonesty,
    midi: {
      enabled: Boolean(midiRaw.enabled),
      channel,
      ports: (midiPorts as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        role: p.role as MidiPortRole,
        hintName: asString(p.hintName),
        portId: asString(p.portId),
        label: asString(p.label),
      })),
    },
    audio: {
      enabled: Boolean(audioRaw.enabled),
      ports: (audioPorts as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        role: p.role as AudioPortRole,
        label: asString(p.label),
        deviceId: asString(p.deviceId),
        channels: asNumber(p.channels),
      })),
    },
    capabilities: Array.isArray(raw.capabilities)
      ? (raw.capabilities as DeviceCapability[])
      : undefined,
    notes: asString(raw.notes),
    createdAt: asNumber(raw.createdAt),
    updatedAt: asNumber(raw.updatedAt),
  };

  if (isPlainObject(raw.provenance)) {
    instrument.provenance = {
      deviceProfileKey: asString(raw.provenance.deviceProfileKey),
      deviceKind: asString(raw.provenance.deviceKind),
      genericProfileId: asString(raw.provenance.genericProfileId),
      studioRoleId: asString(raw.provenance.studioRoleId) as StudioRoleId | undefined,
      controllerDevice: asString(raw.provenance.controllerDevice) as CtrlDevice | undefined,
    };
  }

  return { ok: true, instrument, errors: [] };
}

export function parseInstrumentBundle(raw: unknown): InstrumentBundleParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['bundle must be an object'] };
  if (raw.schemaVersion !== INSTRUMENT_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion (want ${INSTRUMENT_SCHEMA_VERSION})`);
  }
  if (raw.kind !== 'splot-instruments') errors.push('kind must be splot-instruments');
  if (!Array.isArray(raw.instruments)) errors.push('instruments array required');
  if (!Array.isArray(raw.chains)) errors.push('chains array required');
  if (errors.length) return { ok: false, errors };

  const instruments: Instrument[] = [];
  for (const [i, row] of (raw.instruments as unknown[]).entries()) {
    const r = parseInstrument(row);
    if (!r.ok || !r.instrument) {
      errors.push(`instruments[${i}]: ${r.errors.join('; ')}`);
      continue;
    }
    instruments.push(r.instrument);
  }

  const chains: InstrumentChain[] = [];
  const instrumentIds = new Set(instruments.map((x) => x.id));
  for (const [i, row] of (raw.chains as unknown[]).entries()) {
    if (!isPlainObject(row)) {
      errors.push(`chains[${i}]: not an object`);
      continue;
    }
    if (row.schemaVersion !== INSTRUMENT_SCHEMA_VERSION) {
      errors.push(`chains[${i}]: bad schemaVersion`);
      continue;
    }
    const id = asString(row.id);
    const name = asString(row.name)?.trim();
    if (!id || !ID_SAFE.test(id) || !name) {
      errors.push(`chains[${i}]: id/name required`);
      continue;
    }
    if (!Array.isArray(row.stages)) {
      errors.push(`chains[${i}]: stages array required`);
      continue;
    }
    const stages: ChainStage[] = [];
    let stageOk = true;
    for (const [j, s] of (row.stages as unknown[]).entries()) {
      if (!isPlainObject(s) || !asString(s.id) || !STAGE_ROLE_SET.has(String(s.role))) {
        errors.push(`chains[${i}].stages[${j}]: id + role required`);
        stageOk = false;
        break;
      }
      const instrumentId = asString(s.instrumentId);
      if (!instrumentId || !instrumentIds.has(instrumentId)) {
        errors.push(`chains[${i}].stages[${j}]: unknown instrumentId`);
        stageOk = false;
        break;
      }
      const midiChannel = asNumber(s.midiChannel);
      if (midiChannel != null && (midiChannel < 1 || midiChannel > 16)) {
        errors.push(`chains[${i}].stages[${j}]: midiChannel 1–16`);
        stageOk = false;
        break;
      }
      stages.push({
        id: String(s.id),
        role: s.role as ChainStageRole,
        instrumentId,
        midiChannel,
        audioBus: asString(s.audioBus),
      });
    }
    if (!stageOk) continue;
    chains.push({
      schemaVersion: INSTRUMENT_SCHEMA_VERSION,
      id,
      name,
      stages,
      notes: asString(row.notes),
    });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    bundle: {
      schemaVersion: INSTRUMENT_SCHEMA_VERSION,
      kind: 'splot-instruments',
      instruments,
      chains,
      exportedAt: asNumber(raw.exportedAt) ?? Date.now(),
    },
    errors: [],
  };
}

export function instrumentFromDeviceProfile(
  key: string,
  profile: DeviceProfile,
): Instrument {
  const ports: InstrumentMidiPort[] = [];
  if (profile.hasMidi) {
    ports.push({
      id: `${key}-in`,
      role: 'in',
      hintName: profile.portNameHints[0],
      label: 'MIDI In',
    });
    ports.push({
      id: `${key}-out`,
      role: 'out',
      hintName: profile.portNameHints[0],
      label: 'MIDI Out',
    });
  }
  const audioPorts: InstrumentAudioPort[] = profile.hasAudioCapture
    ? [{ id: `${key}-audio-in`, role: 'in', label: 'Capture' }]
    : [];

  return {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    id: `builtin:${key}`,
    displayName: profile.displayName,
    manufacturer: profile.manufacturer,
    kind: profile.kind,
    honesty: 'builtin',
    midi: { enabled: profile.hasMidi, ports },
    audio: { enabled: profile.hasAudioCapture, ports: audioPorts },
    capabilities: profile.capabilities.map((c) => ({ ...c })),
    provenance: { deviceProfileKey: key, deviceKind: profile.kind },
    notes: 'Projected from DEVICE_PROFILES — storage keys unchanged',
  };
}

export function instrumentFromGenericProfile(profile: GenericDeviceProfile): Instrument {
  const ports: InstrumentMidiPort[] = [];
  if (profile.inputPortName) {
    ports.push({
      id: `${profile.id}-in`,
      role: 'in',
      hintName: profile.inputPortName,
      label: 'MIDI In',
    });
  }
  if (profile.outputPortName) {
    ports.push({
      id: `${profile.id}-out`,
      role: 'out',
      hintName: profile.outputPortName,
      label: 'MIDI Out',
    });
  }
  // Generic MIDI profiles are MIDI-first; audio stays off until explicitly added.
  return {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    id: `generic:${profile.id}`,
    displayName: profile.displayName,
    manufacturer: profile.manufacturer,
    kind: profile.category,
    honesty: profile.honesty,
    midi: {
      enabled: true,
      channel: profile.channel,
      ports:
        ports.length > 0
          ? ports
          : [
              { id: `${profile.id}-in`, role: 'in', label: 'MIDI In' },
              { id: `${profile.id}-out`, role: 'out', label: 'MIDI Out' },
            ],
    },
    audio: { enabled: false, ports: [] },
    capabilities: profile.capabilities.map((c) => ({ ...c })),
    provenance: { genericProfileId: profile.id },
    notes: profile.notes,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function instrumentFromStudioRole(role: StudioRoleDef): Instrument {
  const ports: InstrumentMidiPort[] = role.midi
    ? [
        {
          id: `${role.id}-in`,
          role: 'in',
          hintName: role.portNameHints[0],
          label: 'MIDI In',
        },
        {
          id: `${role.id}-out`,
          role: 'out',
          hintName: role.portNameHints[0],
          label: 'MIDI Out',
        },
      ]
    : [];
  // ZED is audio-only in the studio map; MIDI roles stay MIDI-first here.
  const audioPorts: InstrumentAudioPort[] = !role.midi
    ? [
        { id: `${role.id}-audio-in`, role: 'in', label: 'Audio in' },
        { id: `${role.id}-bus`, role: 'bus', label: 'Mix bus' },
      ]
    : [];

  return {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    id: `role:${role.id}`,
    displayName: role.label,
    kind: role.kind,
    honesty: 'builtin',
    midi: { enabled: role.midi, ports },
    audio: {
      enabled: !role.midi,
      ports: audioPorts,
    },
    provenance: { studioRoleId: role.id, deviceKind: role.kind },
    notes: 'Projected from MY_STUDIO_ROLES — does not rewrite StudioSetup storage',
  };
}

/** Project built-in DEVICE_PROFILES into Instrument[] (read-only view). */
export function projectBuiltinInstruments(): Instrument[] {
  return Object.entries(DEVICE_PROFILES).map(([key, profile]) =>
    instrumentFromDeviceProfile(key, profile),
  );
}

/** Project My Studio roles into Instrument[] (read-only view). */
export function projectStudioRoleInstruments(): Instrument[] {
  return MY_STUDIO_ROLES.map(instrumentFromStudioRole);
}

/**
 * Example FM1 jam chain (schema sketch only).
 * Does not create MidiRoutes or toggle forwardClock.
 */
export function exampleFm1JamChain(instruments: {
  circuitId: InstrumentId;
  fm1Id: InstrumentId;
}): InstrumentChain {
  return {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    id: 'chain:example-fm1-jam',
    name: 'Circuit → FM1 (example)',
    stages: [
      {
        id: 'stage-source',
        role: 'source',
        instrumentId: instruments.circuitId,
      },
      {
        id: 'stage-dest',
        role: 'destination',
        instrumentId: instruments.fm1Id,
        midiChannel: 5,
      },
    ],
    notes:
      'Draft only — live routing remains MidiRoute / studio-layout. Clock forward stays off by default.',
  };
}

export function makeInstrumentBundle(
  instruments: Instrument[],
  chains: InstrumentChain[] = [],
): InstrumentBundle {
  return {
    schemaVersion: INSTRUMENT_SCHEMA_VERSION,
    kind: 'splot-instruments',
    instruments,
    chains,
    exportedAt: Date.now(),
  };
}

/** True when an instrument claims audio capture — pickers still must filter built-in mics. */
export function instrumentHasAudio(instrument: Instrument): boolean {
  return instrument.audio.enabled && instrument.audio.ports.length > 0;
}

export function instrumentHasMidi(instrument: Instrument): boolean {
  return instrument.midi.enabled;
}

/** Guard used by tests — schema must never imply clock forwarding. */
export function chainImpliesClockForward(_chain: InstrumentChain): false {
  return false;
}
