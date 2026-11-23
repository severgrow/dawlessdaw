/**
 * Logical mixer data model — levels / mute / solo / buses (plan step 15).
 *
 * MIXTEE topology + Zynthian strip ideas are **REFERENCE / REIMPLEMENT** only:
 * this is a schema for StudioRuntime / mix scenes later, **not** a claim of
 * MIXTEE 16×8 hardware, ZED MIDI control, or a shipping multichannel product.
 *
 * Does not touch MidiRoute, CaptureEngine, clock defaults, or SysEx.
 */

export const MIXER_SCHEMA_VERSION = 1 as const;

export type MixerChannelId = string;
export type MixerBusId = string;

/** Bus role — logical only; not a hardware I/O map. */
export type MixerBusKind = 'main' | 'aux' | 'group' | 'cue';

/**
 * One strip: level, pan, mute, solo → a bus.
 * `instrumentId` / stage `audioBus` strings may point at `busId`.
 */
export interface MixerChannelStrip {
  id: MixerChannelId;
  name: string;
  /** Linear gain; 1 = unity. Clamped on validate to [0, 4] (headroom). */
  level: number;
  /** −1 = full L, 0 = centre, +1 = full R. */
  pan: number;
  mute: boolean;
  solo: boolean;
  busId: MixerBusId;
  /** Optional link to `@dawlessdaw/devices` Instrument id. */
  instrumentId?: string;
  notes?: string;
}

export interface MixerBus {
  id: MixerBusId;
  name: string;
  kind: MixerBusKind;
  /** Bus master level; 1 = unity. */
  level: number;
  mute: boolean;
  notes?: string;
}

/**
 * Versioned mixer graph — export/import shape (`kind: splot-mixer`).
 * Honesty: logical model only; empty default is fine until UI/runtime exists.
 */
export interface MixerGraph {
  schemaVersion: typeof MIXER_SCHEMA_VERSION;
  kind: 'splot-mixer';
  channels: MixerChannelStrip[];
  buses: MixerBus[];
  /**
   * When true (default) and any channel is soloed, non-solo channels are
   * silenced in {@link resolveMixerAudibility}.
   */
  exclusiveSolo: boolean;
  notes?: string;
}

export interface MixerParseResult {
  ok: boolean;
  graph?: MixerGraph;
  errors: string[];
}

/** Effective strip after mute / solo / bus mute — for tests & future DSP. */
export interface ResolvedMixerChannel {
  id: MixerChannelId;
  busId: MixerBusId;
  /** Channel level × bus level, or 0 when not audible. */
  effectiveLevel: number;
  pan: number;
  audible: boolean;
  mutedByChannel: boolean;
  mutedBySolo: boolean;
  mutedByBus: boolean;
}

const BUS_KIND_SET = new Set<string>(['main', 'aux', 'group', 'cue']);

export function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, n));
}

export function clampPan(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(-1, n));
}

/** Minimal honest default: Main + Cue buses, no channels (no fake 16×8 claim). */
export function createEmptyMixerGraph(notes?: string): MixerGraph {
  return {
    schemaVersion: MIXER_SCHEMA_VERSION,
    kind: 'splot-mixer',
    exclusiveSolo: true,
    notes:
      notes ??
      'Logical mixer only — not MIXTEE hardware / not a multichannel product claim.',
    buses: [
      { id: 'main', name: 'Main', kind: 'main', level: 1, mute: false },
      { id: 'cue', name: 'Cue', kind: 'cue', level: 1, mute: false },
    ],
    channels: [],
  };
}

/**
 * Small demo graph for tests / docs — stereo-ish strips into Main.
 * Still not a product claim of channel count.
 */
export function createDemoMixerGraph(): MixerGraph {
  const base = createEmptyMixerGraph(
    'Demo strips for Vitest — not a shipping mixer layout.',
  );
  return {
    ...base,
    channels: [
      {
        id: 'ch-circuit',
        name: 'Circuit',
        level: 1,
        pan: 0,
        mute: false,
        solo: false,
        busId: 'main',
        instrumentId: 'circuit-rhythm',
      },
      {
        id: 'ch-sp404',
        name: 'SP-404',
        level: 0.85,
        pan: -0.2,
        mute: false,
        solo: false,
        busId: 'main',
        instrumentId: 'sp404',
      },
      {
        id: 'ch-mpc',
        name: 'MPC',
        level: 0.9,
        pan: 0.2,
        mute: false,
        solo: false,
        busId: 'main',
        instrumentId: 'mpc',
      },
    ],
  };
}

export function validateMixerGraph(graph: MixerGraph): string[] {
  const errors: string[] = [];
  if (graph.kind !== 'splot-mixer') {
    errors.push('kind must be splot-mixer');
  }
  if (graph.schemaVersion !== MIXER_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion (want ${MIXER_SCHEMA_VERSION})`);
  }
  if (!Array.isArray(graph.buses) || graph.buses.length === 0) {
    errors.push('buses must be a non-empty array');
  }
  if (!Array.isArray(graph.channels)) {
    errors.push('channels must be an array');
  }

  const busIds = new Set<string>();
  for (const bus of graph.buses ?? []) {
    if (!bus?.id || typeof bus.id !== 'string') {
      errors.push('each bus needs a string id');
      continue;
    }
    if (busIds.has(bus.id)) errors.push(`duplicate bus id: ${bus.id}`);
    busIds.add(bus.id);
    if (!BUS_KIND_SET.has(bus.kind)) {
      errors.push(`bus ${bus.id}: kind must be main|aux|group|cue`);
    }
    if (typeof bus.level !== 'number' || bus.level < 0 || bus.level > 4) {
      errors.push(`bus ${bus.id}: level must be 0…4`);
    }
    if (typeof bus.mute !== 'boolean') {
      errors.push(`bus ${bus.id}: mute must be boolean`);
    }
  }

  const channelIds = new Set<string>();
  for (const ch of graph.channels ?? []) {
    if (!ch?.id || typeof ch.id !== 'string') {
      errors.push('each channel needs a string id');
      continue;
    }
    if (channelIds.has(ch.id)) errors.push(`duplicate channel id: ${ch.id}`);
    channelIds.add(ch.id);
    if (typeof ch.level !== 'number' || ch.level < 0 || ch.level > 4) {
      errors.push(`channel ${ch.id}: level must be 0…4`);
    }
    if (typeof ch.pan !== 'number' || ch.pan < -1 || ch.pan > 1) {
      errors.push(`channel ${ch.id}: pan must be −1…+1`);
    }
    if (typeof ch.mute !== 'boolean' || typeof ch.solo !== 'boolean') {
      errors.push(`channel ${ch.id}: mute and solo must be boolean`);
    }
    if (!ch.busId || !busIds.has(ch.busId)) {
      errors.push(`channel ${ch.id}: busId must reference an existing bus`);
    }
  }

  return errors;
}

export function parseMixerGraph(raw: unknown): MixerParseResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['mixer graph must be an object'] };
  }
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'splot-mixer') errors.push('kind must be splot-mixer');
  if (o.schemaVersion !== MIXER_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion (want ${MIXER_SCHEMA_VERSION})`);
  }

  const busesIn = Array.isArray(o.buses) ? o.buses : null;
  const channelsIn = Array.isArray(o.channels) ? o.channels : null;
  if (!busesIn) errors.push('buses must be an array');
  if (!channelsIn) errors.push('channels must be an array');
  if (errors.length) return { ok: false, errors };

  const buses: MixerBus[] = [];
  for (const b of busesIn!) {
    if (!b || typeof b !== 'object') {
      errors.push('bus entries must be objects');
      continue;
    }
    const row = b as Record<string, unknown>;
    buses.push({
      id: String(row.id ?? ''),
      name: typeof row.name === 'string' ? row.name : String(row.id ?? 'Bus'),
      kind: (BUS_KIND_SET.has(String(row.kind)) ? row.kind : 'aux') as MixerBusKind,
      level: clampLevel(typeof row.level === 'number' ? row.level : 1),
      mute: row.mute === true,
      notes: typeof row.notes === 'string' ? row.notes : undefined,
    });
  }

  const channels: MixerChannelStrip[] = [];
  for (const c of channelsIn!) {
    if (!c || typeof c !== 'object') {
      errors.push('channel entries must be objects');
      continue;
    }
    const row = c as Record<string, unknown>;
    channels.push({
      id: String(row.id ?? ''),
      name: typeof row.name === 'string' ? row.name : String(row.id ?? 'Channel'),
      level: clampLevel(typeof row.level === 'number' ? row.level : 1),
      pan: clampPan(typeof row.pan === 'number' ? row.pan : 0),
      mute: row.mute === true,
      solo: row.solo === true,
      busId: String(row.busId ?? ''),
      instrumentId: typeof row.instrumentId === 'string' ? row.instrumentId : undefined,
      notes: typeof row.notes === 'string' ? row.notes : undefined,
    });
  }

  const graph: MixerGraph = {
    schemaVersion: MIXER_SCHEMA_VERSION,
    kind: 'splot-mixer',
    buses,
    channels,
    exclusiveSolo: o.exclusiveSolo !== false,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
  };

  const v = validateMixerGraph(graph);
  if (v.length) return { ok: false, errors: v };
  return { ok: true, graph, errors: [] };
}

/**
 * Apply mute / exclusive-solo / bus mute. Pure — no audio I/O.
 */
export function resolveMixerAudibility(graph: MixerGraph): ResolvedMixerChannel[] {
  const busById = new Map(graph.buses.map((b) => [b.id, b]));
  const anySolo =
    graph.exclusiveSolo !== false && graph.channels.some((c) => c.solo === true);

  return graph.channels.map((ch) => {
    const bus = busById.get(ch.busId);
    const mutedByChannel = ch.mute === true;
    const mutedBySolo = anySolo && !ch.solo;
    const mutedByBus = bus?.mute === true;
    const audible = !mutedByChannel && !mutedBySolo && !mutedByBus;
    const busLevel = bus ? clampLevel(bus.level) : 0;
    const effectiveLevel = audible ? clampLevel(ch.level) * busLevel : 0;
    return {
      id: ch.id,
      busId: ch.busId,
      effectiveLevel,
      pan: clampPan(ch.pan),
      audible,
      mutedByChannel,
      mutedBySolo,
      mutedByBus,
    };
  });
}

/** Look up a bus by id (e.g. InstrumentChain stage `audioBus`). */
export function findMixerBus(graph: MixerGraph, busId: string): MixerBus | undefined {
  return graph.buses.find((b) => b.id === busId);
}
