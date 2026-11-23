/**
 * Circuit Controller — turn the Circuit Rhythm into a controller for the SP-404MKII,
 * FM1 (Skiff) and MPC One, described in plain words instead of MIDI numbers.
 *
 * Model: 8 Circuit tracks. Each track plays at most one destination (a device +
 * a slot on it: SP bank, Skiff track, MPC track) and has 8 knob slots matching
 * the Circuit's 8 macro knobs. The Circuit sends a track's notes and macro CCs
 * on that track's MIDI channel (1–8), so knobs always follow the track selected
 * on the Circuit.
 *
 * Safety: only notes and mapped knobs pass. Everything else (unmapped CCs, the
 * Circuit's own Program Changes, pitch bend, aftertouch, SysEx) is dropped.
 */
import type { MidiRoute } from '@dawlessdaw/routing';
import {
  CIRCUIT_MIXER_LEVEL_CC,
  CIRCUIT_MIXER_PAN_CC,
  CIRCUIT_MIXER_TO_DEST_CC,
  CIRCUIT_TRACKS,
  MIDI_PAN_CC,
  MIDI_VOLUME_CC,
  circuitMixerCcToDest,
  type Fm1Firmware,
  type TrackPlan,
} from './studio-layout';

export type CtrlDevice = 'sp' | 'fm1' | 'mpc';
export const CTRL_DEVICES: readonly CtrlDevice[] = ['sp', 'fm1', 'mpc'];

/** Where a track plays: device + slot (SP bank 1–10, Skiff track 1–6, MPC track 1–8). */
export interface CtrlDest {
  device: CtrlDevice;
  slot: number;
}

export interface KnobSlot {
  /** Id from KNOB_TARGETS, 'custom' (uses `cc`) or null = not mapped (dropped). */
  target: string | null;
  /** Output range the knob's 0–127 is squeezed into. */
  min: number;
  max: number;
  /** Only for target 'custom'. */
  cc?: number;
}

export interface CtrlTrack {
  dest: CtrlDest | null;
  /** The Circuit note that should hit pad 1 / the first note; null = notes pass unchanged. */
  firstNote: number | null;
  knobs: KnobSlot[];
}

export interface ControllerPreset {
  id: string;
  name: string;
  builtIn?: boolean;
  /** index 0–7 = Circuit tracks 1–8 */
  tracks: CtrlTrack[];
  /** MIDI channel each Skiff track 1–6 listens on (Skiff default: track n = ch n). */
  skiffChannels: number[];
}

/** The Circuit Rhythm's 8 macro knobs send CC 21–28 on the selected track's channel. */
export const CIRCUIT_MACRO_CCS = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const KNOB_COUNT = 8;

export const DEVICE_NAME: Record<CtrlDevice, string> = {
  sp: 'SP-404',
  fm1: 'FM1 (Skiff)',
  mpc: 'MPC One',
};

export const SLOT_COUNT: Record<CtrlDevice, number> = { sp: 10, fm1: 6, mpc: 8 };

/**
 * MPC track n listens on this channel. 15 is skipped: it is the Section Bridge
 * control channel (program change + mute CC), which a track must not hear.
 */
export const MPC_TRACK_CHANNELS = [9, 10, 11, 12, 13, 14, 16, 1] as const;

/** SP-404MKII MIDI Mode A: bank A–J = ch 1–10, pads 1–16 = notes 36–51 (Roland). */
export const SP_PAD1_NOTE = 36;
/** MPC default (Classic) pad map: pad 1 = note 37. Check your program. */
export const MPC_PAD1_NOTE = 37;

export function slotLabel(dest: CtrlDest): string {
  if (dest.device === 'sp') return `Bank ${'ABCDEFGHIJ'[dest.slot - 1] ?? '?'}`;
  return `Track ${dest.slot}`;
}

/** "SP · Bank A", "FM1 · Track 1", "MPC · Track 3", "— off" */
export function destBadge(dest: CtrlDest | null): string {
  if (!dest) return '— off';
  const short = dest.device === 'sp' ? 'SP' : dest.device === 'fm1' ? 'FM1' : 'MPC';
  return `${short} · ${slotLabel(dest)}`;
}

export function destChannel(dest: CtrlDest, preset: Pick<ControllerPreset, 'skiffChannels'>): number {
  if (dest.device === 'sp') return dest.slot; // Mode A: bank = channel
  if (dest.device === 'mpc') return MPC_TRACK_CHANNELS[dest.slot - 1] ?? 9;
  return preset.skiffChannels[dest.slot - 1] ?? dest.slot;
}

/** Note that pad 1 expects on this device (null = notes pass unchanged, e.g. a synth). */
export function destPad1Note(dest: CtrlDest | null): number | null {
  if (!dest) return null;
  if (dest.device === 'sp') return SP_PAD1_NOTE;
  if (dest.device === 'mpc') return MPC_PAD1_NOTE;
  return null;
}

export function trackTranspose(track: CtrlTrack): number {
  const base = destPad1Note(track.dest);
  if (base == null || track.firstNote == null) return 0;
  return base - track.firstNote;
}

// ─── Knob targets (per device profile) ──────────────────────────

export interface KnobTarget {
  id: string;
  device: CtrlDevice;
  label: string;
  /** 'cc' sends a controller; 'steps' sends Program Change zones (Skiff sound select). */
  kind: 'cc' | 'steps';
  cc?: number;
  steps?: number;
  /** One-line plain note shown under the slot. */
  hint?: string;
  /** false = not yet confirmed on this studio's hardware. */
  verified: boolean;
}

/**
 * Sources: Skiff README (standard CCs; Program Change = nth preset). SP-404MKII
 * MIDI implementation (effect CTRL CCs 16–19, 80–83) — which on-screen effect
 * knob each CC moves is not yet confirmed here (bench h6), so they are named by
 * order only. The SP's effect on/off CC is not offered until it is confirmed.
 * MPC: no fixed parameter map; "Learnable" CCs are for the MPC's own MIDI Learn.
 */
export const KNOB_TARGETS: readonly KnobTarget[] = [
  // SP-404MKII
  ...[16, 17, 18, 19, 80, 81, 82, 83].map((cc, i) => ({
    id: `sp.fx${i + 1}`,
    device: 'sp' as const,
    label: `Effect control ${i + 1}`,
    kind: 'cc' as const,
    cc,
    hint: 'SP effect CTRL (Roland MIDI chart). Which knob it moves: bench test h6.',
    verified: false,
  })),
  // Skiff (FM1)
  ...(
    [
      ['brightness', 'Brightness', 74],
      ['resonance', 'Resonance', 71],
      ['attack', 'Attack', 73],
      ['decay', 'Decay', 75],
      ['release', 'Release', 72],
      ['delay', 'Delay send', 94],
      ['reverb', 'Reverb send', 91],
      ['level', 'Level', 7],
      ['pan', 'Pan', 10],
      ['chorus', 'Chorus send', 93],
      ['glide', 'Glide', 5],
    ] as const
  ).map(([id, label, cc]) => ({
    id: `fm1.${id}`,
    device: 'fm1' as const,
    label,
    kind: 'cc' as const,
    cc,
    verified: false,
  })),
  {
    id: 'fm1.sound',
    device: 'fm1',
    label: 'Sound (steps through 8)',
    kind: 'steps',
    steps: 8,
    hint: 'Each zone of the knob loads the next sound of the track’s engine (Program Change).',
    verified: false,
  },
  // MPC
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `mpc.learn${i + 1}`,
    device: 'mpc' as const,
    label: `Learnable ${i + 1}`,
    kind: 'cc' as const,
    cc: CIRCUIT_MACRO_CCS[i]!,
    hint: 'On the MPC: MIDI Learn → touch the control → press Test here.',
    verified: false,
  })),
];

export function knobTarget(id: string | null): KnobTarget | undefined {
  return id ? KNOB_TARGETS.find((t) => t.id === id) : undefined;
}

export function targetsFor(device: CtrlDevice): KnobTarget[] {
  return KNOB_TARGETS.filter((t) => t.device === device);
}

/** CC a slot sends, or null (not mapped / steps / invalid custom). */
export function slotCc(slot: KnobSlot): number | null {
  if (slot.target === 'custom') {
    return slot.cc != null && slot.cc >= 0 && slot.cc <= 119 ? slot.cc : null;
  }
  const t = knobTarget(slot.target);
  return t?.kind === 'cc' && t.cc != null ? t.cc : null;
}

export function slotLabelText(slot: KnobSlot): string {
  if (slot.target === 'custom') return slot.cc != null ? `CC ${slot.cc}` : 'Custom CC';
  return knobTarget(slot.target)?.label ?? 'not mapped';
}

// ─── Presets ─────────────────────────────────────────────────────

export const emptyKnob = (): KnobSlot => ({ target: null, min: 0, max: 127 });
export const emptyTrack = (): CtrlTrack => ({
  dest: null,
  firstNote: null,
  knobs: Array.from({ length: KNOB_COUNT }, emptyKnob),
});

const SKIFF_KNOBS = ['brightness', 'resonance', 'attack', 'decay', 'release', 'delay', 'reverb', 'level'];

export type MyStudioVariant = 'sp' | 'mpc';

/**
 * "My Studio": T1–T4 → SP banks A–D (or MPC tracks 1–4), T5–T8 → Skiff tracks 1–4
 * (Skiff default channels 1–4); FM1 knobs = Brightness, Resonance, Attack, Decay,
 * Release, Delay, Reverb, Level.
 */
export function myStudioPreset(variant: MyStudioVariant = 'sp'): ControllerPreset {
  const tracks: CtrlTrack[] = CIRCUIT_TRACKS.map((t) => {
    const track = emptyTrack();
    if (t <= 4) {
      track.dest = { device: variant, slot: t };
      if (variant === 'sp') track.firstNote = 60; // Circuit note 60 → pad 1 (learnable)
      if (variant === 'mpc') {
        track.knobs = track.knobs.map((_, i) => ({ target: `mpc.learn${i + 1}`, min: 0, max: 127 }));
      }
    } else {
      track.dest = { device: 'fm1', slot: t - 4 };
      track.knobs = SKIFF_KNOBS.map((k) => ({ target: `fm1.${k}`, min: 0, max: 127 }));
    }
    return track;
  });
  return {
    id: `builtin-my-studio-${variant}`,
    name: variant === 'sp' ? 'My Studio · T1–4 → SP' : 'My Studio · T1–4 → MPC',
    builtIn: true,
    tracks,
    skiffChannels: [1, 2, 3, 4, 5, 6],
  };
}

/**
 * Default live-rig preset (verified path 22 Nov 2026):
 * T1–T4 → MPC (Scarlett DIN), T5–T6 → Skiff 1–2, T7–T8 → SP banks A–B.
 * Banks are easy to change on the Controller track strip (Bank dropdown).
 */
export function ploeLiveV1Preset(): ControllerPreset {
  const tracks: CtrlTrack[] = CIRCUIT_TRACKS.map((t) => {
    const track = emptyTrack();
    if (t <= 4) {
      track.dest = { device: 'mpc', slot: t };
      track.knobs = track.knobs.map((_, i) => ({ target: `mpc.learn${i + 1}`, min: 0, max: 127 }));
    } else if (t <= 6) {
      track.dest = { device: 'fm1', slot: t - 4 };
      track.knobs = SKIFF_KNOBS.map((k) => ({ target: `fm1.${k}`, min: 0, max: 127 }));
    } else {
      // T7 → Bank A, T8 → Bank B (sensible defaults; change on Controller anytime)
      track.dest = { device: 'sp', slot: t - 6 };
      track.firstNote = 60;
    }
    return track;
  });
  return {
    id: 'builtin-ploe-live-v1',
    name: 'Ploe Live v1',
    builtIn: true,
    tracks,
    skiffChannels: [1, 2, 3, 4, 5, 6],
  };
}

/** Built-ins: Ploe Live v1 first (app default), then older My Studio variants. */
export const BUILTIN_PRESETS: readonly ControllerPreset[] = [
  ploeLiveV1Preset(),
  myStudioPreset('sp'),
  myStudioPreset('mpc'),
];

export function clonePreset(p: ControllerPreset): ControllerPreset {
  return JSON.parse(JSON.stringify(p)) as ControllerPreset;
}

/** Copy one track's setup (device, first note, knob page) onto others. */
export function copyTrack(p: ControllerPreset, from: number, to: number[]): ControllerPreset {
  const next = clonePreset(p);
  const src = next.tracks[from - 1];
  if (!src) return next;
  for (const t of to) {
    if (t === from || t < 1 || t > 8) continue;
    next.tracks[t - 1] = JSON.parse(JSON.stringify(src)) as CtrlTrack;
  }
  return next;
}

/** Move a knob slot to another knob position (swap) — used by "Twist to pick". */
export function swapKnobs(p: ControllerPreset, track: number, a: number, b: number): ControllerPreset {
  const next = clonePreset(p);
  const k = next.tracks[track - 1]?.knobs;
  if (!k || a === b || !k[a] || !k[b]) return next;
  [k[a], k[b]] = [k[b]!, k[a]!];
  return next;
}

/** Older Rig-grid plan → controller preset (first send per track). */
export function presetFromTrackPlan(
  plan: TrackPlan,
  spNoteOffset: number,
  fm1Firmware: Fm1Firmware,
): ControllerPreset {
  const p = myStudioPreset('sp');
  p.id = 'migrated';
  p.name = 'My setup (from Rig grid)';
  p.builtIn = false;
  // The Rig grid sent FM1 on the Circuit's own channel (Skiff T1–T4 set to ch5–8).
  p.skiffChannels = [5, 6, 7, 8, 9, 10];
  p.tracks = CIRCUIT_TRACKS.map((t) => {
    const send = (plan[t] ?? [])[0];
    const track = emptyTrack();
    if (!send) return track;
    if (send.dest === 'sp') {
      track.dest = { device: 'sp', slot: send.channel };
      track.firstNote = SP_PAD1_NOTE - spNoteOffset;
    } else if (send.dest === 'mpc') {
      const slot = MPC_TRACK_CHANNELS.indexOf(send.channel as (typeof MPC_TRACK_CHANNELS)[number]) + 1;
      track.dest = { device: 'mpc', slot: slot > 0 ? slot : Math.min(8, t) };
      track.knobs = track.knobs.map((_, i) => ({ target: `mpc.learn${i + 1}`, min: 0, max: 127 }));
    } else {
      const slot = p.skiffChannels.indexOf(send.channel) + 1;
      track.dest = { device: 'fm1', slot: slot > 0 ? slot : 1 };
      if (fm1Firmware === 'skiff') {
        track.knobs = [...SKIFF_KNOBS.slice(0, 7), 'sound'].map((k) => ({ target: `fm1.${k}`, min: 0, max: 127 }));
      }
    }
    return track;
  });
  return p;
}

const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** Accept a saved/imported preset only in a known-good shape. */
export function sanitizePreset(raw: unknown): ControllerPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.tracks)) return null;
  const tracks: CtrlTrack[] = CIRCUIT_TRACKS.map((_, i) => {
    const t = (r.tracks as unknown[])[i] as Record<string, unknown> | undefined;
    const track = emptyTrack();
    if (!t) return track;
    const d = t.dest as Record<string, unknown> | null;
    if (d && CTRL_DEVICES.includes(d.device as CtrlDevice)) {
      const device = d.device as CtrlDevice;
      const slot = int(d.slot, 1, SLOT_COUNT[device]);
      if (slot != null) track.dest = { device, slot };
    }
    track.firstNote = int(t.firstNote, 0, 127);
    if (Array.isArray(t.knobs)) {
      track.knobs = track.knobs.map((_, k) => {
        const s = (t.knobs as unknown[])[k] as Record<string, unknown> | undefined;
        if (!s) return emptyKnob();
        const target =
          s.target === 'custom' || (typeof s.target === 'string' && knobTarget(s.target)) ? (s.target as string) : null;
        return {
          target,
          min: int(s.min, 0, 127) ?? 0,
          max: int(s.max, 0, 127) ?? 127,
          ...(target === 'custom' && int(s.cc, 0, 119) != null ? { cc: s.cc as number } : {}),
        };
      });
    }
    return track;
  });
  const sc = Array.isArray(r.skiffChannels) ? r.skiffChannels : [];
  return {
    id: r.id.slice(0, 64),
    name: r.name.slice(0, 48) || 'Untitled',
    tracks,
    skiffChannels: [0, 1, 2, 3, 4, 5].map((i) => int(sc[i], 1, 16) ?? i + 1),
  };
}

// ─── Routes ──────────────────────────────────────────────────────

/** Never passed on, whatever the mapping says. SysEx is dropped by the engine itself. */
const ALWAYS_BLOCKED = ['program-change', 'pitch-bend', 'aftertouch'];

/**
 * One route per playing track: its channel → the device channel, notes shifted
 * so the first note hits pad 1, only mapped knobs (with their ranges).
 */
export function buildControllerRoutes(
  preset: ControllerPreset,
  ports: { circuitIn: string; mpcOut: string; spOut: string; fm1Out: string },
  opts: { fm1Firmware?: Fm1Firmware; mpcNoteMode?: 'usb' | 'din-only' } = {},
): MidiRoute[] {
  const routes: MidiRoute[] = [];
  preset.tracks.forEach((track, i) => {
    const t = i + 1;
    const dest = track.dest;
    if (!dest) return;
    if (dest.device === 'mpc' && opts.mpcNoteMode === 'din-only') return;
    const out = dest.device === 'sp' ? ports.spOut : dest.device === 'mpc' ? ports.mpcOut : ports.fm1Out;
    const channel = destChannel(dest, preset);
    const notesOnly = dest.device === 'fm1' && opts.fm1Firmware === 'h1';
    const map: Record<number, number> = {};
    const scale: Record<number, { min: number; max: number }> = {};
    let toProgramChange: { controller: number; steps: number } | undefined;
    if (!notesOnly) {
      track.knobs.forEach((slot, k) => {
        const src = CIRCUIT_MACRO_CCS[k]!;
        const tgt = knobTarget(slot.target);
        if (tgt?.kind === 'steps') {
          toProgramChange ??= { controller: src, steps: tgt.steps ?? 8 };
          return;
        }
        const cc = slotCc(slot);
        if (cc == null) return;
        map[src] = cc;
        if (slot.min !== 0 || slot.max !== 127) scale[src] = { min: slot.min, max: slot.max };
      });
      // Mixer Level/Pan (CC29/30) → Volume/Pan on the destination — same as My Studio layout.
      for (const [src, destCc] of Object.entries(CIRCUIT_MIXER_TO_DEST_CC)) {
        map[Number(src)] = destCc;
      }
    }
    const transpose = trackTranspose(track);
    routes.push({
      id: `ctrl-t${t}-${dest.device}`,
      name: `Circuit T${t} → ${DEVICE_NAME[dest.device]} ${slotLabel(dest)} (ch${channel})`,
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: out }],
      channel: { allow: [t], remap: { [t]: channel } },
      ...(transpose ? { note: { transpose } } : {}),
      cc: {
        map,
        dropUnmapped: true,
        ...(Object.keys(scale).length ? { scale } : {}),
        ...(toProgramChange ? { toProgramChange } : {}),
      },
      forwardClock: false,
      blockKinds: notesOnly ? [...ALWAYS_BLOCKED, 'cc'] : [...ALWAYS_BLOCKED],
    });
  });
  return routes;
}

// ─── Plain-English helpers ───────────────────────────────────────

/**
 * Why drums on Circuit T1 suddenly play the program you just loaded on MPC track 3:
 * the app already isolates channels (T1→ch9 … T4→ch12 on one USB/DIN out). The MPC
 * must filter them — "All" or Auto monitoring makes every Circuit track hit the
 * selected / omni track.
 */
export const MPC_CHANNEL_ISOLATION_HINT =
  'App map: Circuit T1–T4 → MPC ch9–12 on one Out port (filtered per channel, not omni). On each MPC track: MIDI In = that channel (not All), monitoring = In (not Auto). Section Bridge PC stays on ch15 only.';

/** "on the MPC, set this track's MIDI input to channel X" and friends. */
export function destHowTo(dest: CtrlDest, preset: ControllerPreset): string {
  const ch = destChannel(dest, preset);
  if (dest.device === 'sp') return `Needs the SP in MIDI Mode A (bank ${'ABCDEFGHIJ'[dest.slot - 1]} listens on channel ${ch}).`;
  if (dest.device === 'mpc')
    return `On the MPC, set track ${dest.slot}'s MIDI input to channel ${ch} (MIDI In port) — not All — and monitoring to In (not Auto).`;
  return `On the FM1: Skiff MENU › MIDI › T${dest.slot} CHANNEL = ${ch}.`;
}

export interface CtrlEvent {
  text: string;
  device: CtrlDevice | null;
  track: number;
  knob?: number;
  value?: number;
}

/** Describe one incoming Circuit message as the app will route it. */
export function describeIncoming(
  preset: ControllerPreset,
  msg: { kind: string; channel?: number; note?: number; controller?: number; value?: number; velocity?: number },
): CtrlEvent | null {
  const resolved = resolveControlMapping(preset, msg);
  if (resolved) {
    return {
      text: resolved.eventText,
      device: resolved.dest?.device ?? null,
      track: resolved.track,
      knob: resolved.knob,
      value: resolved.value,
    };
  }
  const t = msg.channel ?? 0;
  if (t < 1 || t > 8) return null;
  const track = preset.tracks[t - 1]!;
  const dest = track.dest;
  if (msg.kind === 'cc' && msg.controller != null) {
    return { text: `T${t} CC ${msg.controller} → dropped (not a user control)`, device: null, track: t };
  }
  if (msg.kind === 'note-on' && (msg.velocity ?? 0) > 0 && msg.note != null) {
    if (!dest) return { text: `T${t} note ${msg.note} → off (dropped)`, device: null, track: t };
    const out = msg.note + trackTranspose(track);
    const base = destPad1Note(dest);
    const pad = base != null ? out - base + 1 : null;
    const where = `${DEVICE_NAME[dest.device].replace(' (Skiff)', '')} ${slotLabel(dest)}`;
    return {
      text:
        pad != null && pad >= 1 && pad <= 16
          ? `T${t} note ${msg.note} → ${where} pad ${pad}`
          : `T${t} note ${msg.note} → ${where} note ${out}`,
      device: dest.device,
      track: t,
    };
  }
  return null;
}

/** User-facing Circuit controls that may open the learn glass (not clock / SysEx). */
export type LearnControlKind = 'macro' | 'mixer-level' | 'mixer-pan';

export interface ResolvedControlMapping {
  track: number;
  kind: LearnControlKind;
  /** Macro index 0–7 when kind === 'macro'. */
  knob?: number;
  sourceLabel: string;
  sourceCc: number;
  sourceChannel: number;
  dest: CtrlDest | null;
  /** Short param name, e.g. "Level" / "not mapped". */
  paramLabel: string;
  /** "→ FM1 Level CC7 on ch5" */
  detail: string;
  /** One-line live strip text. */
  eventText: string;
  value?: number;
  /** Whether the glass can edit a knob target for this control. */
  editableKnob: boolean;
}

const MIXER_LABEL: Record<number, string> = {
  [CIRCUIT_MIXER_LEVEL_CC]: 'Mixer Level',
  [CIRCUIT_MIXER_PAN_CC]: 'Mixer Pan',
};

const MIXER_DEST_LABEL: Record<number, string> = {
  [MIDI_VOLUME_CC]: 'Volume (CC7)',
  [MIDI_PAN_CC]: 'Pan (CC10)',
};

/**
 * Resolve a Circuit CC (macro or mixer) to plain-English source → destination.
 * Returns null for clock, notes, SysEx, and non-user CCs — call sites must not spam UI.
 */
export function resolveControlMapping(
  preset: ControllerPreset,
  msg: { kind: string; channel?: number; controller?: number; value?: number },
): ResolvedControlMapping | null {
  if (msg.kind !== 'cc' || msg.controller == null) return null;
  const t = msg.channel ?? 0;
  if (t < 1 || t > 8) return null;
  const track = preset.tracks[t - 1]!;
  const dest = track.dest;
  const v = msg.value;
  const cc = msg.controller;

  const macroIdx = CIRCUIT_MACRO_CCS.indexOf(cc as (typeof CIRCUIT_MACRO_CCS)[number]);
  if (macroIdx >= 0) {
    const slot = track.knobs[macroIdx]!;
    const sourceLabel = `Circuit Track ${t} · Macro ${macroIdx + 1}`;
    if (!dest || !slot.target) {
      return {
        track: t,
        kind: 'macro',
        knob: macroIdx,
        sourceLabel,
        sourceCc: cc,
        sourceChannel: t,
        dest,
        paramLabel: 'not mapped',
        detail: dest ? '→ not mapped (dropped)' : '→ Circuit only (app sends nothing)',
        eventText: `T${t} knob ${macroIdx + 1} → not mapped (dropped)`,
        value: v,
        editableKnob: true,
      };
    }
    const tgt = knobTarget(slot.target);
    const where = `${DEVICE_NAME[dest.device].replace(' (Skiff)', '')} ${slotLabel(dest)}`;
    const ch = destChannel(dest, preset);
    if (tgt?.kind === 'steps') {
      const steps = tgt.steps ?? 8;
      const zone = Math.min(steps - 1, Math.floor(((v ?? 0) * steps) / 128));
      return {
        track: t,
        kind: 'macro',
        knob: macroIdx,
        sourceLabel,
        sourceCc: cc,
        sourceChannel: t,
        dest,
        paramLabel: tgt.label,
        detail: `→ ${where} sound ${zone + 1} (Program Change on ch${ch})`,
        eventText: `T${t} knob ${macroIdx + 1} → ${where} sound ${zone + 1}`,
        value: v,
        editableKnob: true,
      };
    }
    const out = Math.round(slot.min + (((v ?? 0) * (slot.max - slot.min)) / 127));
    const outCc = slotCc(slot);
    const param = slotLabelText(slot);
    return {
      track: t,
      kind: 'macro',
      knob: macroIdx,
      sourceLabel,
      sourceCc: cc,
      sourceChannel: t,
      dest,
      paramLabel: param,
      detail:
        outCc != null
          ? `→ ${where} ${param} CC${outCc} on ch${ch} · ${out}`
          : `→ ${where} ${param} · ${out}`,
      eventText: `T${t} knob ${macroIdx + 1} → ${where} ${param} ${out}`,
      value: v,
      editableKnob: true,
    };
  }

  const mixerDestCc = circuitMixerCcToDest(cc);
  if (mixerDestCc != null) {
    const kind: LearnControlKind = cc === CIRCUIT_MIXER_LEVEL_CC ? 'mixer-level' : 'mixer-pan';
    const sourceLabel = `Circuit Track ${t} · ${MIXER_LABEL[cc] ?? `CC ${cc}`}`;
    const destParam = MIXER_DEST_LABEL[mixerDestCc] ?? `CC${mixerDestCc}`;
    if (!dest) {
      return {
        track: t,
        kind,
        sourceLabel,
        sourceCc: cc,
        sourceChannel: t,
        dest: null,
        paramLabel: destParam,
        detail: '→ Circuit only (app sends nothing)',
        eventText: `T${t} ${MIXER_LABEL[cc]} → Circuit only`,
        value: v,
        editableKnob: false,
      };
    }
    const where = `${DEVICE_NAME[dest.device].replace(' (Skiff)', '')} ${slotLabel(dest)}`;
    const ch = destChannel(dest, preset);
    return {
      track: t,
      kind,
      sourceLabel,
      sourceCc: cc,
      sourceChannel: t,
      dest,
      paramLabel: destParam,
      detail: `→ ${where} ${destParam} on ch${ch}`,
      eventText: `T${t} ${MIXER_LABEL[cc]} → ${where} ${destParam}`,
      value: v,
      editableKnob: false,
    };
  }

  return null;
}

/** Stable id for debounce / “same control still moving” checks. */
export function controlMappingKey(r: Pick<ResolvedControlMapping, 'track' | 'kind' | 'knob'>): string {
  return r.kind === 'macro' ? `t${r.track}:macro${r.knob ?? 0}` : `t${r.track}:${r.kind}`;
}

/** True for realtime MIDI that must never open the learn glass (clock / transport). */
export function isLearnGlassIgnoredMidi(kind: string): boolean {
  return (
    kind === 'clock' ||
    kind === 'start' ||
    kind === 'stop' ||
    kind === 'continue' ||
    kind === 'song-position' ||
    kind === 'active-sensing' ||
    kind === 'sysex'
  );
}

/** Plain warnings: two tracks on one slot, Skiff channel clashes. */
export function controllerWarnings(preset: ControllerPreset): string[] {
  const out: string[] = [];
  const seen = new Map<string, number[]>();
  preset.tracks.forEach((tr, i) => {
    if (!tr.dest) return;
    const k = `${tr.dest.device}:${tr.dest.slot}`;
    seen.set(k, [...(seen.get(k) ?? []), i + 1]);
  });
  for (const [k, ts] of seen) {
    if (ts.length < 2) continue;
    const [device, slot] = k.split(':');
    out.push(
      `${ts.map((t) => `T${t}`).join(' and ')} both play ${destBadge({ device: device as CtrlDevice, slot: Number(slot) })} (layered).`,
    );
  }
  const used = new Set(preset.skiffChannels);
  if (used.size < preset.skiffChannels.length) out.push('Two Skiff tracks share a MIDI channel — the first one plays it.');
  return out;
}
