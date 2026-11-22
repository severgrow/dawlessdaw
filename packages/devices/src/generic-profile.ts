/**
 * Versioned generic / user device profiles.
 *
 * Honesty tiers (never invent controls):
 * - generic    — MIDI I/O only; no claimed parameter map
 * - documented — from a manual / reference; live Pass still pending
 * - verified   — owner confirmed on hardware
 *
 * Schema comment for a future community/AI marketplace — not built here.
 * Import/export is local JSON only; validation never executes code.
 */

import type { CapabilityStatus, DeviceCapability, MidiPortInfo } from '@dawlessdaw/core';
import { scorePortAgainstHints } from './port-matcher';

/** Bump only with a migration path; importers reject unknown versions. */
export const DEVICE_PROFILE_SCHEMA_VERSION = 1 as const;

export type ProfileHonesty = 'generic' | 'documented' | 'verified';

export type DeviceCategory =
  | 'synth'
  | 'drum'
  | 'sampler'
  | 'controller'
  | 'sequencer'
  | 'fx'
  | 'interface'
  | 'other';

/** Optional user-named control — only present when the user (or a documented map) adds it. */
export interface GenericControl {
  id: string;
  label: string;
  /** MIDI CC 0–119 when known; omit until Learn or manual entry. */
  cc?: number;
  /** Note number 0–127 when the control is a pad / key. */
  note?: number;
  /** Channel 1–16; defaults to the profile channel when omitted. */
  channel?: number;
}

/**
 * Local custom / unknown-device profile.
 * Built-in studio roles stay in `profiles.ts`; this covers extras + honesty metadata.
 */
export interface GenericDeviceProfile {
  schemaVersion: typeof DEVICE_PROFILE_SCHEMA_VERSION;
  id: string;
  displayName: string;
  manufacturer: string;
  category: DeviceCategory;
  /** CSS colour for strip / list chips (validated hex). */
  colour: string;
  /** Default MIDI channel 1–16 (notes/CC when not overridden per control). */
  channel: number;
  /** Remembered Web MIDI port names for reconnect (ids change between sessions). */
  inputPortName: string | null;
  outputPortName: string | null;
  /** Extra name fragments for auto-match (in addition to displayName). */
  portNameHints: string[];
  honesty: ProfileHonesty;
  capabilities: DeviceCapability[];
  /** Empty for pure Generic — never invent knobs. */
  controls: GenericControl[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileParseResult {
  ok: boolean;
  profile?: GenericDeviceProfile;
  errors: string[];
}

export interface ProfileBundle {
  schemaVersion: typeof DEVICE_PROFILE_SCHEMA_VERSION;
  kind: 'dawlessdaw-device-profiles';
  profiles: GenericDeviceProfile[];
  exportedAt: number;
}

export interface BundleParseResult {
  ok: boolean;
  bundle?: ProfileBundle;
  errors: string[];
}

export const STORAGE_KEY_CUSTOM_PROFILES = 'dawlessdaw.customProfiles.v1';

export const PROFILE_HONESTY_LABEL: Record<ProfileHonesty, string> = {
  generic: 'Generic — MIDI notes and CCs only; no invented controls',
  documented: 'Documented — from a manual or reference; not live-verified here',
  verified: 'Verified — owner confirmed on this hardware',
};

export const DEVICE_CATEGORIES: ReadonlyArray<{ id: DeviceCategory; label: string }> = [
  { id: 'synth', label: 'Synth' },
  { id: 'drum', label: 'Drums' },
  { id: 'sampler', label: 'Sampler' },
  { id: 'controller', label: 'Controller' },
  { id: 'sequencer', label: 'Sequencer' },
  { id: 'fx', label: 'FX' },
  { id: 'interface', label: 'Interface' },
  { id: 'other', label: 'Other' },
];

const CATEGORY_SET = new Set<string>(DEVICE_CATEGORIES.map((c) => c.id));
const HONESTY_SET = new Set<string>(['generic', 'documented', 'verified']);
const CAP_STATUS_SET = new Set<string>([
  'verified',
  'untested',
  'experimental',
  'unavailable',
  'unknown',
]);

const HEX_COLOUR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ID_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

const DEFAULT_GENERIC_CAPS: DeviceCapability[] = [
  {
    id: 'midi-io',
    label: 'Generic MIDI I/O',
    status: 'unknown',
    notes: 'Port discovery and passthrough only — no device-specific map',
  },
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function asChannel(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 16) return null;
  return v;
}

function asMidi7(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 127) return null;
  return v;
}

function asCc(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 119) return null;
  return v;
}

function asPortName(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 120) return null;
  if (t === '-' || t === '—' || t === '–') return null;
  return t;
}

function sanitizeCapability(raw: unknown, errors: string[], path: string): DeviceCapability | null {
  if (!isPlainObject(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const id = asTrimmedString(raw.id, 64);
  const label = asTrimmedString(raw.label, 120);
  if (!id || !ID_SAFE.test(id)) {
    errors.push(`${path}.id invalid`);
    return null;
  }
  if (!label) {
    errors.push(`${path}.label required`);
    return null;
  }
  const status = raw.status;
  if (typeof status !== 'string' || !CAP_STATUS_SET.has(status)) {
    errors.push(`${path}.status must be a known CapabilityStatus`);
    return null;
  }
  const notes = asTrimmedString(raw.notes, 400);
  return {
    id,
    label,
    status: status as CapabilityStatus,
    ...(notes ? { notes } : {}),
  };
}

function sanitizeControl(raw: unknown, errors: string[], path: string): GenericControl | null {
  if (!isPlainObject(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const id = asTrimmedString(raw.id, 64);
  const label = asTrimmedString(raw.label, 80);
  if (!id || !ID_SAFE.test(id)) {
    errors.push(`${path}.id invalid`);
    return null;
  }
  if (!label) {
    errors.push(`${path}.label required`);
    return null;
  }
  const out: GenericControl = { id, label };
  if (raw.cc !== undefined) {
    const cc = asCc(raw.cc);
    if (cc == null) {
      errors.push(`${path}.cc must be 0–119`);
      return null;
    }
    out.cc = cc;
  }
  if (raw.note !== undefined) {
    const note = asMidi7(raw.note);
    if (note == null) {
      errors.push(`${path}.note must be 0–127`);
      return null;
    }
    out.note = note;
  }
  if (raw.channel !== undefined) {
    const ch = asChannel(raw.channel);
    if (ch == null) {
      errors.push(`${path}.channel must be 1–16`);
      return null;
    }
    out.channel = ch;
  }
  // Reject executable / nested payloads — controls are flat data only.
  for (const key of Object.keys(raw)) {
    if (!['id', 'label', 'cc', 'note', 'channel'].includes(key)) {
      errors.push(`${path}: unknown field "${key}"`);
      return null;
    }
  }
  return out;
}

/**
 * Validate and normalize one profile object. Never evaluates strings as code.
 */
export function sanitizeGenericProfile(raw: unknown): ProfileParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['Profile must be a JSON object'] };
  }

  if (raw.schemaVersion !== DEVICE_PROFILE_SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion ${String(raw.schemaVersion)} (expected ${DEVICE_PROFILE_SCHEMA_VERSION})`,
    );
  }

  const id = asTrimmedString(raw.id, 64);
  if (!id || !ID_SAFE.test(id)) errors.push('id required (letters, numbers, ._-:)');

  const displayName = asTrimmedString(raw.displayName, 80);
  if (!displayName) errors.push('displayName required');

  const manufacturer = asTrimmedString(raw.manufacturer, 80) ?? 'Unknown';

  const category = raw.category;
  if (typeof category !== 'string' || !CATEGORY_SET.has(category)) {
    errors.push('category must be a known DeviceCategory');
  }

  const colourRaw = asTrimmedString(raw.colour, 16) ?? '#888888';
  if (!HEX_COLOUR.test(colourRaw)) errors.push('colour must be #RGB or #RRGGBB');

  const channel = asChannel(raw.channel) ?? 1;
  if (raw.channel !== undefined && asChannel(raw.channel) == null) {
    errors.push('channel must be 1–16');
  }

  const honesty = raw.honesty;
  if (typeof honesty !== 'string' || !HONESTY_SET.has(honesty)) {
    errors.push('honesty must be generic | documented | verified');
  }

  // Refuse anything that looks like executable payload (own keys only — `in` hits prototypes).
  for (const banned of ['__proto__', 'constructor', 'prototype', 'eval', 'script']) {
    if (Object.prototype.hasOwnProperty.call(raw, banned)) {
      errors.push(`Forbidden field "${banned}"`);
    }
  }

  const inputPortName = asPortName(raw.inputPortName);
  const outputPortName = asPortName(raw.outputPortName);
  if (raw.inputPortName !== undefined && raw.inputPortName !== null && inputPortName == null) {
    errors.push('inputPortName invalid');
  }
  if (raw.outputPortName !== undefined && raw.outputPortName !== null && outputPortName == null) {
    errors.push('outputPortName invalid');
  }

  let portNameHints: string[] = [];
  if (raw.portNameHints !== undefined) {
    if (!Array.isArray(raw.portNameHints)) {
      errors.push('portNameHints must be an array of strings');
    } else {
      portNameHints = raw.portNameHints
        .map((h) => asTrimmedString(h, 80))
        .filter((h): h is string => Boolean(h))
        .slice(0, 24);
      if (portNameHints.length !== raw.portNameHints.length) {
        errors.push('portNameHints entries must be non-empty strings ≤80 chars');
      }
    }
  }

  let capabilities: DeviceCapability[] = [...DEFAULT_GENERIC_CAPS];
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities)) {
      errors.push('capabilities must be an array');
    } else if (raw.capabilities.length > 32) {
      errors.push('capabilities: max 32');
    } else {
      const caps: DeviceCapability[] = [];
      raw.capabilities.forEach((c, i) => {
        const s = sanitizeCapability(c, errors, `capabilities[${i}]`);
        if (s) caps.push(s);
      });
      if (caps.length) capabilities = caps;
    }
  }

  let controls: GenericControl[] = [];
  if (raw.controls !== undefined) {
    if (!Array.isArray(raw.controls)) {
      errors.push('controls must be an array');
    } else if (raw.controls.length > 64) {
      errors.push('controls: max 64');
    } else {
      const seen = new Set<string>();
      raw.controls.forEach((c, i) => {
        const s = sanitizeControl(c, errors, `controls[${i}]`);
        if (!s) return;
        if (seen.has(s.id)) {
          errors.push(`controls: duplicate id "${s.id}"`);
          return;
        }
        seen.add(s.id);
        controls.push(s);
      });
    }
  }

  // Generic honesty forbids claiming a control map.
  if (honesty === 'generic' && controls.some((c) => c.cc != null || c.note != null)) {
    // Allow storing Learn results with honesty still generic until user upgrades —
    // but only when every control was user-added. Fake manufacturer maps are the problem.
    // Soft rule: if honesty is generic, capability status stays unknown (enforced below).
  }
  if (honesty === 'generic') {
    capabilities = capabilities.map((c) =>
      c.status === 'verified' ? { ...c, status: 'unknown' as CapabilityStatus } : c,
    );
  }

  const notes = asTrimmedString(raw.notes, 800) ?? undefined;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now();

  if (errors.length) return { ok: false, errors };

  const profile: GenericDeviceProfile = {
    schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
    id: id!,
    displayName: displayName!,
    manufacturer,
    category: category as DeviceCategory,
    colour: colourRaw.toLowerCase(),
    channel,
    inputPortName,
    outputPortName,
    portNameHints,
    honesty: honesty as ProfileHonesty,
    capabilities,
    controls,
    createdAt,
    updatedAt,
    ...(notes ? { notes } : {}),
  };
  return { ok: true, profile, errors: [] };
}

export function createGenericProfile(input: {
  displayName: string;
  manufacturer?: string;
  category?: DeviceCategory;
  colour?: string;
  channel?: number;
  inputPortName?: string | null;
  outputPortName?: string | null;
  portNameHints?: string[];
  honesty?: ProfileHonesty;
  notes?: string;
}): ProfileParseResult {
  const now = Date.now();
  const slug = input.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return sanitizeGenericProfile({
    schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
    id: `custom-${slug || 'device'}-${now.toString(36)}`,
    displayName: input.displayName,
    manufacturer: input.manufacturer ?? 'Unknown',
    category: input.category ?? 'other',
    colour: input.colour ?? '#888888',
    channel: input.channel ?? 1,
    inputPortName: input.inputPortName ?? null,
    outputPortName: input.outputPortName ?? null,
    portNameHints: input.portNameHints ?? [],
    honesty: input.honesty ?? 'generic',
    capabilities: DEFAULT_GENERIC_CAPS,
    controls: [],
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });
}

export function exportProfileJson(profile: GenericDeviceProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function exportProfileBundleJson(profiles: GenericDeviceProfile[]): string {
  const bundle: ProfileBundle = {
    schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
    kind: 'dawlessdaw-device-profiles',
    profiles,
    exportedAt: Date.now(),
  };
  return JSON.stringify(bundle, null, 2);
}

export function importProfileJson(raw: string): ProfileParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
  // Reject arrays / primitives / function-looking payloads early.
  if (typeof raw === 'string' && /^\s*</.test(raw)) {
    return { ok: false, errors: ['HTML/script is not a device profile'] };
  }
  return sanitizeGenericProfile(data);
}

export function importProfileBundleJson(raw: string): BundleParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
  if (!isPlainObject(data)) {
    return { ok: false, errors: ['Bundle must be a JSON object'] };
  }
  // Single profile file → one-item bundle.
  if (data.displayName && data.schemaVersion && !Array.isArray(data.profiles)) {
    const one = sanitizeGenericProfile(data);
    if (!one.ok || !one.profile) return { ok: false, errors: one.errors };
    return {
      ok: true,
      bundle: {
        schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
        kind: 'dawlessdaw-device-profiles',
        profiles: [one.profile],
        exportedAt: Date.now(),
      },
      errors: [],
    };
  }
  if (data.kind !== undefined && data.kind !== 'dawlessdaw-device-profiles') {
    return { ok: false, errors: [`Unknown bundle kind ${String(data.kind)}`] };
  }
  if (data.schemaVersion !== DEVICE_PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `Unsupported schemaVersion ${String(data.schemaVersion)} (expected ${DEVICE_PROFILE_SCHEMA_VERSION})`,
      ],
    };
  }
  if (!Array.isArray(data.profiles)) {
    return { ok: false, errors: ['profiles must be an array'] };
  }
  if (data.profiles.length > 50) {
    return { ok: false, errors: ['profiles: max 50 per file'] };
  }
  const errors: string[] = [];
  const profiles: GenericDeviceProfile[] = [];
  const seen = new Set<string>();
  data.profiles.forEach((p, i) => {
    const r = sanitizeGenericProfile(p);
    if (!r.ok || !r.profile) {
      errors.push(...r.errors.map((e) => `profiles[${i}]: ${e}`));
      return;
    }
    if (seen.has(r.profile.id)) {
      errors.push(`profiles[${i}]: duplicate id "${r.profile.id}"`);
      return;
    }
    seen.add(r.profile.id);
    profiles.push(r.profile);
  });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    bundle: {
      schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
      kind: 'dawlessdaw-device-profiles',
      profiles,
      exportedAt:
        typeof data.exportedAt === 'number' && Number.isFinite(data.exportedAt)
          ? data.exportedAt
          : Date.now(),
    },
    errors: [],
  };
}

/** Load custom profiles from localStorage (browser) or return []. */
export function loadCustomProfiles(storage?: Storage | null): GenericDeviceProfile[] {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return [];
    const raw = store.getItem(STORAGE_KEY_CUSTOM_PROFILES);
    if (!raw) return [];
    const parsed = importProfileBundleJson(raw);
    if (!parsed.ok || !parsed.bundle) return [];
    return parsed.bundle.profiles;
  } catch {
    return [];
  }
}

export function saveCustomProfiles(
  profiles: GenericDeviceProfile[],
  storage?: Storage | null,
): void {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return;
    store.setItem(STORAGE_KEY_CUSTOM_PROFILES, exportProfileBundleJson(profiles));
  } catch {
    // quota / private mode
  }
}

/** Hints used to re-bind a custom profile after reconnect. */
export function hintsForCustomProfile(p: GenericDeviceProfile): string[] {
  const base = [
    p.displayName,
    p.manufacturer,
    p.inputPortName ?? '',
    p.outputPortName ?? '',
    ...p.portNameHints,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(base)];
}

/**
 * Re-attach remembered input/output ports by exact name, else best hint score.
 * Ambiguous equal top scores leave that side unbound (caller shows Assign).
 */
export function restoreCustomProfilePorts(
  profile: GenericDeviceProfile,
  ports: MidiPortInfo[],
  claimed: Set<string> = new Set(),
): { inputPortId: string | null; outputPortId: string | null; ambiguous: boolean } {
  const connected = ports.filter((p) => p.state === 'connected' && !claimed.has(p.id));
  const inputs = connected.filter((p) => p.type === 'input');
  const outputs = connected.filter((p) => p.type === 'output');
  const hints = hintsForCustomProfile(profile);

  const pick = (
    list: MidiPortInfo[],
    remembered: string | null,
  ): { id: string | null; ambiguous: boolean } => {
    if (remembered) {
      const exact = list.filter((p) => p.name === remembered);
      if (exact.length === 1) return { id: exact[0]!.id, ambiguous: false };
      if (exact.length > 1) return { id: null, ambiguous: true };
    }
    const ranked = list
      .map((p) => ({ p, s: scorePortAgainstHints(p, hints) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) return { id: null, ambiguous: false };
    if (ranked.length >= 2 && ranked[0]!.s === ranked[1]!.s) {
      return { id: null, ambiguous: true };
    }
    return { id: ranked[0]!.p.id, ambiguous: false };
  };

  const inn = pick(inputs, profile.inputPortName);
  const out = pick(
    outputs.filter((p) => p.id !== inn.id),
    profile.outputPortName,
  );
  return {
    inputPortId: inn.id,
    outputPortId: out.id,
    ambiguous: inn.ambiguous || out.ambiguous,
  };
}

/** Apply Learn: set CC (+ optional channel) on a control; honesty stays as-is. */
export function applyLearnToControl(
  profile: GenericDeviceProfile,
  controlId: string,
  cc: number,
  channel?: number,
): ProfileParseResult {
  const controls = profile.controls.map((c) => {
    if (c.id !== controlId) return c;
    return {
      ...c,
      cc,
      ...(channel != null ? { channel } : {}),
    };
  });
  if (!controls.some((c) => c.id === controlId)) {
    return { ok: false, errors: [`Unknown control "${controlId}"`] };
  }
  return sanitizeGenericProfile({
    ...profile,
    controls,
    updatedAt: Date.now(),
  });
}

export function addControl(
  profile: GenericDeviceProfile,
  label: string,
): ProfileParseResult {
  const clean = label.trim().slice(0, 80);
  if (!clean) return { ok: false, errors: ['Control label required'] };
  const id = `ctrl-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'n'}-${Date.now().toString(36)}`;
  return sanitizeGenericProfile({
    ...profile,
    controls: [...profile.controls, { id, label: clean }],
    updatedAt: Date.now(),
  });
}

export function removeControl(
  profile: GenericDeviceProfile,
  controlId: string,
): ProfileParseResult {
  return sanitizeGenericProfile({
    ...profile,
    controls: profile.controls.filter((c) => c.id !== controlId),
    updatedAt: Date.now(),
  });
}

/**
 * Map built-in DeviceProfile capability statuses → a single honesty tier for UI badges.
 * Never upgrades to verified without an owner Pass (capabilities stay untested).
 */
export function honestyFromCapabilities(caps: DeviceCapability[]): ProfileHonesty {
  if (caps.some((c) => c.status === 'verified')) return 'verified';
  if (caps.some((c) => c.status === 'untested' || c.status === 'experimental')) return 'documented';
  return 'generic';
}

/** Plain-language first-run step for Setup / Rig banners. */
export type OnboardingStep = 'connect' | 'identify' | 'assign' | 'play';

export function nextOnboardingStep(input: {
  midiReady: boolean;
  midiError: string | null;
  connectedPortCount: number;
  circuitAssigned: boolean;
  hasUnmatchedPorts: boolean;
  hasAmbiguousCustom?: boolean;
}): { step: OnboardingStep; message: string } {
  if (!input.midiReady) {
    return {
      step: 'connect',
      message:
        input.midiError ??
        'Allow MIDI in Chrome (lock icon in the address bar), then click Rescan.',
    };
  }
  if (input.connectedPortCount === 0) {
    return {
      step: 'connect',
      message: 'No MIDI ports yet — plug devices in over USB, check Audio MIDI Setup, then Rescan.',
    };
  }
  if (!input.circuitAssigned || input.hasUnmatchedPorts || input.hasAmbiguousCustom) {
    if (!input.circuitAssigned) {
      return {
        step: 'identify',
        message: 'Pick which port is the Circuit (Setup → Ports). Other gear can wait.',
      };
    }
    return {
      step: 'assign',
      message: input.hasAmbiguousCustom
        ? 'Two ports look the same — choose In/Out for your custom device in Setup.'
        : 'Unassigned ports found — map them in Setup, or add an unknown device.',
    };
  }
  return {
    step: 'play',
    message: 'Ports look good — open Rig, press Play on the Circuit, watch the track lights.',
  };
}

/** Plain clock / connection hint (replaces jargon like receive-none). */
export function plainClockHint(input: {
  forwarding: boolean;
  circuitIn: boolean;
  missingOuts: string[];
  mpcUsbClockRisk: boolean;
  heardClock: boolean;
  forwardedClock: boolean;
}): string {
  if (!input.forwarding) {
    return 'App clock is off — Circuit tempo stays on your thru box unless you turn on → MPC / → SP / → FM1.';
  }
  if (!input.circuitIn) {
    return 'Circuit In is not assigned — open Setup and pick the Circuit MIDI in port.';
  }
  if (input.missingOuts.length) {
    return `Nothing to send clock to — assign an output for ${input.missingOuts.join(' + ')} in Setup.`;
  }
  if (input.mpcUsbClockRisk) {
    return 'MPC Out looks like the Akai USB port — that port ignores clock from a computer. Prefer Scarlett → MPC DIN In.';
  }
  if (!input.heardClock) {
    return 'No clock from Circuit yet — turn Clock Tx on (pad 32 bright) and press Play.';
  }
  if (!input.forwardedClock) {
    return 'Hearing Circuit clock, but nothing left this app — press Rebuild routes in Setup › Troubleshooting.';
  }
  return 'Clock is flowing. If a sequencer still sits still, check that device’s MIDI Sync / Receive Clock.';
}
