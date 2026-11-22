import type { MidiRoute } from '@dawlessdaw/routing';

/** Logical studio members for the user's real Mac + USB setup. */
export type StudioRoleId = 'circuit' | 'mpc' | 'sp404' | 'fm1' | 'zed';

export interface StudioRoleDef {
  id: StudioRoleId;
  label: string;
  kind: string;
  midi: boolean;
  portNameHints: string[];
}

/**
 * Patryk's studio — USB MIDI to Mac; hardware MIDI thru outside the app.
 *
 * FM1 jam path (default focus): Circuit T5–T8 → FM1 running Skiff over USB
 * (Chrome often names the port "Felucca"). Set Skiff T1–T4 to listen on ch5–8.
 * Circuit macro CCs 21–28 are translated to Skiff CCs (CIRCUIT_MACRO_TO_SKIFF_CC).
 * MPC / SP USB note routes remain in the template for when those devices are
 * connected; they simply no-op (missing port placeholders) when absent.
 *
 * Thru box (when used) forwards ALL Circuit MIDI (notes 1–8 + ch16 PGM + clock)
 * to MPC + SP DIN. App remaps USB notes:
 *   Circuit ch1–4 → MPC ch9–12 (optional — leave MPC unplugged for FM1-only jam)
 *   Circuit ch5–8 → FM1 ch5–8 (Skiff); the h1 profile keeps the older T5+T6 notes-only path
 *   Project ch16 observed by Section Bridge (never forwarded as notes)
 *
 * MPC "din-only" mode removes every app route to the MPC (MPC tracks listen to the
 * thru-box cable on ch1–4 instead). Never put an FM1 on h1 on the thru chain:
 * h1 plays every channel.
 */
export const MY_STUDIO_ROLES: StudioRoleDef[] = [
  {
    id: 'circuit',
    label: 'Novation Circuit Rhythm',
    kind: 'circuit-rhythm',
    midi: true,
    portNameHints: ['circuit rhythm', 'circuit-rhythm', 'novation circuit'],
  },
  {
    id: 'mpc',
    label: 'Akai MPC One',
    kind: 'mpc-one',
    midi: true,
    // Mac Chrome often reports "Akai Professional MPC One" (and Port 1/2 variants).
    // Token match lets "akai mpc" hit names with "Professional" in between.
    portNameHints: [
      'mpc one',
      'mpc-one',
      'akai professional mpc',
      'akai mpc',
      'akai professional',
      'mpc',
    ],
  },
  {
    id: 'sp404',
    label: 'Roland SP-404MKII',
    kind: 'sp404mkii',
    midi: true,
    portNameHints: ['sp-404', 'sp404', '404mkii', '404 mkii', 'sp 404'],
  },
  {
    id: 'fm1',
    label: 'M-VAVE FM1',
    kind: 'm-vave-fm1',
    midi: true,
    // H-1 / stock USB may omit "fm1" — Felucca, CH345 / WCH CDC / bare M-VAVE are common.
    // Weak CDC hints are last; matcher refuses ports that already look like Circuit/MPC/SP.
    // Bare "h1" is allowed: scorer matches short hints as whole-token / exact compact only.
    portNameHints: [
      'fm1',
      'fm-1',
      'skiff',
      'felucca',
      'h-1',
      'h1',
      'm-vave',
      'm vave',
      'mvave',
      'mvav',
      'ch345',
      'wch.cn',
      'wch',
    ],
  },
  {
    id: 'zed',
    label: 'Allen & Heath ZED-10FX',
    kind: 'zed-10fx',
    midi: false,
    portNameHints: ['zed-10', 'zed10', 'zed 10'],
  },
];

/** Circuit source channel → destination channel for My Studio USB routing. */
export const MY_STUDIO_CHANNEL_REMAP: Readonly<Record<number, number>> = {
  1: 9,
  2: 10,
  3: 11,
  4: 12,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
};

/** FM1 firmware the My Studio preset is built for. */
export type Fm1Firmware = 'skiff' | 'h1';

/** How the MPC receives Circuit notes. */
export type MpcNoteMode = 'usb' | 'din-only';

/** Where Circuit tracks 1–4 go. */
export type CircuitT1to4Target = 'mpc' | 'sp' | 'both';

/** Circuit Rhythm tracks 1–8 send on MIDI channels 1–8 (Circuit default). */
export const CIRCUIT_TRACKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Devices a Circuit track can be sent to. */
export type TrackDestId = 'mpc' | 'sp' | 'fm1';
export const TRACK_DESTS: readonly TrackDestId[] = ['mpc', 'sp', 'fm1'];

/** One send: this Circuit track plays `dest` on `channel`. */
export interface TrackSend {
  dest: TrackDestId;
  channel: number;
}

/** Circuit track (1–8) → its sends (at most one per device). */
export type TrackPlan = Record<number, TrackSend[]>;

/** Channels each device can take. SP Mode A: banks A–J = ch1–10. */
export const TRACK_DEST_CHANNELS: Readonly<Record<TrackDestId, readonly number[]>> = {
  mpc: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  sp: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  fm1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

export function spBankLetter(channel: number): string {
  return 'ABCDEFGHIJ'[channel - 1] ?? '?';
}

/** Sensible channel when a track is first sent to a device. */
export function defaultSendChannel(dest: TrackDestId, track: number): number {
  if (dest === 'mpc') return track <= 4 ? track + 8 : ([13, 14, 16, 16] as const)[track - 5] ?? 16;
  return track; // SP bank = track (A–H), FM1 = same channel (Skiff T1–T4 on 5–8)
}

/** The plan the older settings described (T1–T4 target + FM1 firmware). */
export function legacyTrackPlan(t1to4: CircuitT1to4Target, fm1Firmware: Fm1Firmware): TrackPlan {
  const plan: TrackPlan = {};
  for (const t of CIRCUIT_TRACKS) plan[t] = [];
  for (const t of [1, 2, 3, 4]) {
    if (t1to4 === 'mpc' || t1to4 === 'both') plan[t]!.push({ dest: 'mpc', channel: t + 8 });
    if (t1to4 === 'sp' || t1to4 === 'both') plan[t]!.push({ dest: 'sp', channel: t });
  }
  for (const t of FM1_TRACKS_BY_FIRMWARE[fm1Firmware]) plan[t]!.push({ dest: 'fm1', channel: t });
  return plan;
}

export type TrackPresetId = 'mpc-fm1' | 'sp-fm1' | 'both-fm1' | 'none';
export const TRACK_PRESETS: readonly { id: TrackPresetId; label: string; hint: string }[] = [
  { id: 'mpc-fm1', label: 'MPC + FM1', hint: 'T1–4 → MPC ch9–12 · T5–8 → FM1 ch5–8' },
  { id: 'sp-fm1', label: 'SP + FM1', hint: 'T1–4 → SP banks A–D · T5–8 → FM1 ch5–8' },
  { id: 'both-fm1', label: 'MPC & SP + FM1', hint: 'T1–4 → MPC and SP · T5–8 → FM1' },
  { id: 'none', label: 'Nothing', hint: 'App sends no notes' },
];

export function trackPreset(id: TrackPresetId): TrackPlan {
  if (id === 'none') return Object.fromEntries(CIRCUIT_TRACKS.map((t) => [t, []]));
  return legacyTrackPlan(id === 'sp-fm1' ? 'sp' : id === 'both-fm1' ? 'both' : 'mpc', 'skiff');
}

/** Set, change or remove (channel = null) one track's send to one device. */
export function setTrackSend(
  plan: TrackPlan,
  track: number,
  dest: TrackDestId,
  channel: number | null,
): TrackPlan {
  const next: TrackPlan = {};
  for (const t of CIRCUIT_TRACKS) next[t] = (plan[t] ?? []).map((s) => ({ ...s }));
  const others = (next[track] ?? []).filter((s) => s.dest !== dest);
  next[track] = channel == null ? others : [...others, { dest, channel }].sort(
    (a, b) => TRACK_DESTS.indexOf(a.dest) - TRACK_DESTS.indexOf(b.dest),
  );
  return next;
}

/** Keep only valid sends (known device, allowed channel, one per device per track). */
export function sanitizeTrackPlan(raw: unknown): TrackPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const plan: TrackPlan = {};
  for (const t of CIRCUIT_TRACKS) {
    const list = (raw as Record<string, unknown>)[t];
    const sends: TrackSend[] = [];
    if (Array.isArray(list)) {
      for (const s of list) {
        const dest = (s as TrackSend)?.dest;
        const channel = Number((s as TrackSend)?.channel);
        if (!TRACK_DESTS.includes(dest)) continue;
        if (!TRACK_DEST_CHANNELS[dest].includes(channel)) continue;
        if (sends.some((x) => x.dest === dest)) continue;
        sends.push({ dest, channel });
      }
    }
    plan[t] = sends;
  }
  return plan;
}

/** Plain-English warnings about a plan (doubles, control-channel clashes). */
export function trackPlanWarnings(
  plan: TrackPlan,
  opts: { spNoteOffset: number; mpcNoteMode: MpcNoteMode },
): string[] {
  const out: string[] = [];
  const byKey = new Map<string, number[]>();
  for (const t of CIRCUIT_TRACKS) {
    for (const s of plan[t] ?? []) {
      const k = `${s.dest}:${s.channel}`;
      byKey.set(k, [...(byKey.get(k) ?? []), t]);
      if (s.dest === 'mpc' && s.channel === 15) {
        out.push(`T${t} → MPC ch15 shares the Section Bridge control channel (program change + mute CC).`);
      }
      if (s.dest === 'sp' && s.channel === t && opts.spNoteOffset === 0) {
        out.push(
          `T${t} → SP bank ${spBankLetter(s.channel)}: the thru-box cable already plays this with offset 0, so every note plays twice.`,
        );
      }
    }
  }
  for (const [k, tracks] of byKey) {
    if (tracks.length > 1) {
      const [dest, ch] = k.split(':');
      const name = dest === 'mpc' ? 'MPC' : dest === 'sp' ? 'SP' : 'FM1';
      out.push(`${tracks.map((t) => `T${t}`).join(' and ')} both play ${name} ch${ch} (layered).`);
    }
  }
  if (opts.mpcNoteMode === 'din-only' && CIRCUIT_TRACKS.some((t) => (plan[t] ?? []).some((s) => s.dest === 'mpc'))) {
    out.push('MPC sends are ignored while MPC connection is "MIDI cable from thru box only".');
  }
  return out;
}

/**
 * SP-404MKII MIDI Mode A (Roland): bank A–J = MIDI ch1–10, pads 1–16 = notes 36–51.
 * Circuit T1–T4 (ch1–4) therefore map straight to banks A–D.
 */
export const SP_MODE_A_PAD1_NOTE = 36;
export const SP_MODE_A_PAD16_NOTE = 51;
/** Default shift from Circuit notes to SP pad notes (Circuit 60 → pad 1). Learnable in the app. */
export const DEFAULT_SP_NOTE_OFFSET = -24;

/**
 * Skiff (illuminus5/skiff) — Circuit macro knobs (CC 21–28, sent on each track's
 * own channel) translated to Skiff's standard per-track CCs.
 * Source: Skiff README (standard CCs). Untested on this studio until bench pass.
 */
export const CIRCUIT_MACRO_TO_SKIFF_CC: Readonly<Record<number, number>> = {
  21: 74, // macro 1 → brightness
  22: 71, // macro 2 → resonance
  23: 73, // macro 3 → attack
  24: 75, // macro 4 → decay
  25: 72, // macro 5 → release
  26: 94, // macro 6 → delay send
  27: 91, // macro 7 → reverb send
  // macro 8 (CC28) is the sound knob → Program Change (SKIFF_SOUND_KNOB_CC)
};

/**
 * Skiff "sound knob": this Circuit macro steps the track's Skiff sound.
 * Skiff 1.3+ loads "the track's nth preset of its engine" on Program Change,
 * per track channel (Skiff README, MIDI implementation). The knob is split into
 * SKIFF_SOUND_KNOB_STEPS zones; each zone sends one Program Change on ch5–8.
 * Every Skiff engine has at least 8 sounds, so 8 steps is the safe default.
 * Untested on this studio until bench test h4 passes.
 */
export const SKIFF_SOUND_KNOB_CC = 28; // Circuit macro 8
export const SKIFF_SOUND_KNOB_STEPS = 8;

/** Circuit tracks routed to the FM1 for each firmware. */
export const FM1_TRACKS_BY_FIRMWARE: Readonly<Record<Fm1Firmware, number[]>> = {
  skiff: [5, 6, 7, 8],
  h1: [5, 6],
};

export interface PortAssignment {
  roleId: StudioRoleId;
  inputPortId: string | null;
  outputPortId: string | null;
  /** Last matched / assigned port name fragments for display */
  inputPortName?: string | null;
  outputPortName?: string | null;
  connected: boolean;
  /**
   * True when the user picked this port by hand in Settings. Manual picks are
   * remembered by port name, survive reloads and unplugging, and are never
   * replaced by auto-matching (e.g. MPC Out = "Scarlett 2i4 USB").
   */
  inputManual?: boolean;
  outputManual?: boolean;
}

export interface PersistedStudioSetup {
  version: 1 | 2;
  assignments: PortAssignment[];
  /**
   * Version 1 only: one switch that forwarded clock to MPC + SP together.
   * Read once by migrateClockForwarding(); newer saves write the per-device flags.
   */
  routeClockThroughApp?: boolean;
  /** Forward Circuit clock/start/stop to the MPC's assigned output. Default false. */
  clockToMpc?: boolean;
  /** Forward Circuit clock/start/stop to the SP's output. Default false (SP uses the thru box). */
  clockToSp?: boolean;
  lastRoutingPresetId: string;
  /** FM1 firmware profile for routing (default 'skiff'). Optional for older saves. */
  fm1Firmware?: Fm1Firmware;
  /** 'din-only' = MPC hears Circuit over the thru-box cable; app sends it nothing. */
  mpcNoteMode?: MpcNoteMode;
  /** Forward Circuit clock to FM1 over USB (Skiff CLOCK = USB). Default false. */
  forwardClockToFm1?: boolean;
  /** Where Circuit T1–T4 go (default 'mpc'). */
  circuitT1to4Target?: CircuitT1to4Target;
  /** Semitones added to Circuit T1–T4 notes before they reach the SP (default -24). */
  spNoteOffset?: number;
  /** Per-track sends (Rig grid). When absent, built from circuitT1to4Target + fm1Firmware. */
  trackPlan?: TrackPlan;
  /** Section Bridge on/off and rows (Sections tab). */
  sectionBridge?: { enabled: boolean; rows: unknown[] };
}

export const STORAGE_KEY_STUDIO_SETUP = 'dawlessdaw.studioSetup.v1';

/** Per-device app clock forwarding (each one: clock/start/stop/continue only). */
export interface ClockForwarding {
  mpc: boolean;
  sp: boolean;
  fm1: boolean;
}

/**
 * Read per-device clock switches from a saved setup, migrating version-1 saves:
 * the old single "app clock forwarding" ON becomes MPC ON, SP OFF (the SP gets
 * clock from the thru box, so sending it app clock too would double it).
 */
export function migrateClockForwarding(
  saved: Partial<PersistedStudioSetup> | null | undefined,
): ClockForwarding {
  if (!saved) return { mpc: false, sp: false, fm1: false };
  const hasNewFlags = typeof saved.clockToMpc === 'boolean' || typeof saved.clockToSp === 'boolean';
  return {
    mpc: hasNewFlags ? Boolean(saved.clockToMpc) : Boolean(saved.routeClockThroughApp),
    sp: hasNewFlags ? Boolean(saved.clockToSp) : false,
    fm1: Boolean(saved.forwardClockToFm1),
  };
}

/** True when any device gets app clock — then Circuit input is the clock authority. */
export function anyClockForwarding(c: ClockForwarding): boolean {
  return c.mpc || c.sp || c.fm1;
}

/** Everything except clock / start / stop / continue — clock routes carry nothing else. */
export const CLOCK_ROUTE_BLOCK_KINDS = [
  'note-on',
  'note-off',
  'cc',
  'program-change',
  'aftertouch',
  'pitch-bend',
  'song-position',
  'sysex',
  'unknown',
];

export function buildMyStudioRoutes(ports: {
  circuitIn: string;
  mpcOut: string;
  spOut: string;
  fm1Out: string;
  /** default false — forward Circuit clock/start/stop to the MPC output (e.g. via Scarlett DIN) */
  clockToMpc?: boolean;
  /** default false — forward Circuit clock/start/stop to the SP output (SP normally uses the thru box) */
  clockToSp?: boolean;
  /** default 'skiff' — Circuit T5–T8 → FM1 with macro CC translation */
  fm1Firmware?: Fm1Firmware;
  /** default 'usb' — 'din-only' drops all app routes to the MPC */
  mpcNoteMode?: MpcNoteMode;
  /** default false — forward Circuit clock/start/stop to FM1 over USB */
  forwardClockToFm1?: boolean;
  /** default 'mpc' — 'sp' sends Circuit T1–T4 to SP banks A–D, 'both' does both */
  circuitT1to4Target?: CircuitT1to4Target;
  /** default DEFAULT_SP_NOTE_OFFSET */
  spNoteOffset?: number;
  /** Per-track sends. When absent, built from circuitT1to4Target + fm1Firmware (legacy). */
  trackPlan?: TrackPlan;
}): MidiRoute[] {
  const spNoteOffset = ports.spNoteOffset ?? DEFAULT_SP_NOTE_OFFSET;
  const fm1Firmware: Fm1Firmware = ports.fm1Firmware ?? 'skiff';
  const mpcNoteMode: MpcNoteMode = ports.mpcNoteMode ?? 'usb';
  const plan: TrackPlan =
    ports.trackPlan ?? legacyTrackPlan(ports.circuitT1to4Target ?? 'mpc', fm1Firmware);
  const routes: MidiRoute[] = [];
  const sendsFor = (dest: TrackDestId) =>
    CIRCUIT_TRACKS.flatMap((track) =>
      (plan[track] ?? []).filter((s) => s.dest === dest).map((s) => ({ track, channel: s.channel })),
    );

  for (const { track, channel } of sendsFor('mpc')) {
    routes.push({
      id: `mystudio-t${track}-mpc`,
      name: `Circuit T${track} → MPC ch${channel}`,
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }],
      channel: { allow: [track], remap: { [track]: channel } },
      forwardClock: false,
      blockKinds: ['program-change'],
    });
  }

  for (const { track, channel } of sendsFor('fm1')) {
    if (fm1Firmware === 'skiff') {
      routes.push({
        id: `mystudio-t${track}-fm1`,
        name: `Circuit T${track} → FM1 (Skiff) ch${channel}`,
        enabled: true,
        sourcePortId: ports.circuitIn,
        destinations: [{ portId: ports.fm1Out }],
        channel: { allow: [track], remap: { [track]: channel } },
        // Only translated macro knobs reach Skiff; every other CC is dropped.
        // Macro 8 steps through the track's Skiff sounds via Program Change.
        cc: {
          map: { ...CIRCUIT_MACRO_TO_SKIFF_CC },
          dropUnmapped: true,
          toProgramChange: { controller: SKIFF_SOUND_KNOB_CC, steps: SKIFF_SOUND_KNOB_STEPS },
        },
        forwardClock: false,
        blockKinds: ['program-change'],
      });
    } else {
      // h1 plays every channel: notes only, no CCs.
      routes.push({
        id: `mystudio-t${track}-fm1`,
        name: `Circuit T${track} → FM1 ch${channel}`,
        enabled: true,
        sourcePortId: ports.circuitIn,
        destinations: [{ portId: ports.fm1Out }],
        channel: { allow: [track], remap: { [track]: channel } },
        forwardClock: false,
        blockKinds: ['program-change', 'cc'],
      });
    }
  }

  for (const { track, channel } of sendsFor('sp')) {
    routes.push({
      id: `mystudio-t${track}-sp`,
      name: `Circuit T${track} → SP bank ${spBankLetter(channel)} (ch${channel})`,
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.spOut }],
      // SP MIDI Mode A: bank A–J listen on ch1–10.
      channel: { allow: [track], remap: { [track]: channel } },
      note: { transpose: spNoteOffset },
      forwardClock: false,
      // SP reads CC 20–27 as DJ/Looper controls and PC as pattern select — block both.
      blockKinds: ['program-change', 'cc', 'pitch-bend'],
    });
  }

  if (mpcNoteMode === 'din-only') {
    // MPC hears the Circuit directly over the thru-box cable — app sends it nothing.
    for (let i = routes.length - 1; i >= 0; i--) {
      if (/^mystudio-t[1-8]-mpc$/.test(routes[i]!.id)) routes.splice(i, 1);
    }
  }

  const clockRoute = (id: string, name: string, portId: string): MidiRoute => ({
    id,
    name,
    enabled: true,
    sourcePortId: ports.circuitIn,
    destinations: [{ portId }],
    forwardClock: true,
    blockKinds: [...CLOCK_ROUTE_BLOCK_KINDS],
  });

  // "MIDI cable from thru box only" means the app sends the MPC nothing — clock included.
  if (ports.clockToMpc && mpcNoteMode !== 'din-only') {
    routes.push(clockRoute('mystudio-clock-mpc', 'Circuit clock → MPC', ports.mpcOut));
  }
  if (ports.clockToSp) {
    routes.push(clockRoute('mystudio-clock-sp', 'Circuit clock → SP', ports.spOut));
  }
  if (ports.forwardClockToFm1) {
    routes.push(
      clockRoute('mystudio-clock-fm1', 'Circuit clock → FM1 (Skiff CLOCK = USB)', ports.fm1Out),
    );
  }

  return routes;
}

/** Remap route port IDs using role assignments (keeps route ids/channels). */
export function rebindRoutesToAssignments(
  template: MidiRoute[],
  map: {
    circuitIn?: string | null;
    mpcOut?: string | null;
    spOut?: string | null;
    fm1Out?: string | null;
  },
): MidiRoute[] {
  const replace = (id: string): string => {
    if (id === '__circuit_in__' || id.startsWith('mock-circuit-in') || id === map.circuitIn)
      return map.circuitIn || id;
    if (id === '__mpc_out__' || id.startsWith('mock-mpc-out') || id === map.mpcOut)
      return map.mpcOut || id;
    if (id === '__sp_out__' || id.startsWith('mock-sp404-out') || id === map.spOut)
      return map.spOut || id;
    if (id === '__fm1_out__' || id.startsWith('mock-fm1-out') || id === map.fm1Out)
      return map.fm1Out || id;
    return id;
  };

  return template.map((r) => ({
    ...r,
    sourcePortId: replace(r.sourcePortId),
    destinations: r.destinations.map((d) => ({
      ...d,
      portId: replace(d.portId),
      // Keep route even if dest missing — disable dest if nullish placeholder
      enabled: d.enabled !== false && Boolean(replace(d.portId)),
    })),
  }));
}

export function myStudioTemplateRoutes(): MidiRoute[] {
  return buildMyStudioRoutes({
    circuitIn: '__circuit_in__',
    mpcOut: '__mpc_out__',
    spOut: '__sp_out__',
    fm1Out: '__fm1_out__',
  });
}
