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
  28: 7, // macro 8 → level
};

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
}

export interface PersistedStudioSetup {
  version: 1;
  assignments: PortAssignment[];
  /** When true, app may forward MIDI clock (default false — hardware thru box). */
  routeClockThroughApp: boolean;
  lastRoutingPresetId: string;
  /** FM1 firmware profile for routing (default 'skiff'). Optional for older saves. */
  fm1Firmware?: Fm1Firmware;
  /** 'din-only' = MPC hears Circuit over the thru-box cable; app sends it nothing. */
  mpcNoteMode?: MpcNoteMode;
  /** Forward Circuit clock to FM1 over USB (Skiff CLOCK = USB). Default false. */
  forwardClockToFm1?: boolean;
}

export const STORAGE_KEY_STUDIO_SETUP = 'dawlessdaw.studioSetup.v1';

export function buildMyStudioRoutes(ports: {
  circuitIn: string;
  mpcOut: string;
  spOut: string;
  fm1Out: string;
  /** default false — clock stays on hardware thru */
  forwardClock?: boolean;
  /** default 'skiff' — Circuit T5–T8 → FM1 with macro CC translation */
  fm1Firmware?: Fm1Firmware;
  /** default 'usb' — 'din-only' drops all app routes to the MPC */
  mpcNoteMode?: MpcNoteMode;
  /** default false — forward Circuit clock/start/stop to FM1 over USB */
  forwardClockToFm1?: boolean;
}): MidiRoute[] {
  const fm1Firmware: Fm1Firmware = ports.fm1Firmware ?? 'skiff';
  const mpcNoteMode: MpcNoteMode = ports.mpcNoteMode ?? 'usb';
  const routes: MidiRoute[] = [
    {
      id: 'mystudio-t1-mpc',
      name: 'Circuit T1 → MPC ch9',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }],
      channel: { allow: [1], remap: { 1: 9 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
    {
      id: 'mystudio-t2-mpc',
      name: 'Circuit T2 → MPC ch10',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }],
      channel: { allow: [2], remap: { 2: 10 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
    {
      id: 'mystudio-t3-mpc',
      name: 'Circuit T3 → MPC ch11',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }],
      channel: { allow: [3], remap: { 3: 11 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
    {
      id: 'mystudio-t4-mpc',
      name: 'Circuit T4 → MPC ch12',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }],
      channel: { allow: [4], remap: { 4: 12 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
  ];

  for (const track of FM1_TRACKS_BY_FIRMWARE[fm1Firmware]) {
    if (fm1Firmware === 'skiff') {
      routes.push({
        id: `mystudio-t${track}-fm1`,
        name: `Circuit T${track} → FM1 (Skiff) ch${track}`,
        enabled: true,
        sourcePortId: ports.circuitIn,
        destinations: [{ portId: ports.fm1Out }],
        channel: { allow: [track], remap: { [track]: track } },
        // Only translated macro knobs reach Skiff; every other CC is dropped.
        cc: { map: { ...CIRCUIT_MACRO_TO_SKIFF_CC }, dropUnmapped: true },
        forwardClock: false,
        blockKinds: ['program-change'],
      });
    } else {
      // h1 plays every channel: notes only, no CCs.
      routes.push({
        id: `mystudio-t${track}-fm1`,
        name: `Circuit T${track} → FM1 ch${track}`,
        enabled: true,
        sourcePortId: ports.circuitIn,
        destinations: [{ portId: ports.fm1Out }],
        channel: { allow: [track], remap: { [track]: track } },
        forwardClock: false,
        blockKinds: ['program-change', 'cc'],
      });
    }
  }

  if (mpcNoteMode === 'din-only') {
    // MPC hears the Circuit directly over the thru-box cable — app sends it nothing.
    for (let i = routes.length - 1; i >= 0; i--) {
      if (/^mystudio-t[1-4]-mpc$/.test(routes[i]!.id)) routes.splice(i, 1);
    }
  }

  if (ports.forwardClockToFm1) {
    routes.push({
      id: 'mystudio-clock-fm1',
      name: 'Circuit clock → FM1 (USB, Skiff CLOCK = USB)',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.fm1Out }],
      forwardClock: true,
      blockKinds: [
        'note-on',
        'note-off',
        'cc',
        'program-change',
        'aftertouch',
        'pitch-bend',
      ],
    });
  }

  if (ports.forwardClock) {
    routes.push({
      id: 'mystudio-clock',
      name: 'Circuit clock → MPC + SP (app path)',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.mpcOut }, { portId: ports.spOut }],
      forwardClock: true,
      blockKinds: [
        'note-on',
        'note-off',
        'cc',
        'program-change',
        'aftertouch',
        'pitch-bend',
      ],
    });
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
    forwardClock: false,
  });
}
