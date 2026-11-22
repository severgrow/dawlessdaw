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
 * FM1 jam path (default focus): Circuit T5 + T6 → Felucca / FM1 over USB.
 * MPC / SP USB note routes remain in the template for when those devices are
 * connected; they simply no-op (missing port placeholders) when absent.
 *
 * Thru box (when used) forwards ALL Circuit MIDI (notes 1–8 + ch16 PGM + clock)
 * to MPC + SP DIN. App remaps USB notes:
 *   Circuit ch1–4 → MPC ch9–12 (optional — leave MPC unplugged for FM1-only jam)
 *   Circuit ch5   → FM1 ch5
 *   Circuit ch6   → FM1 ch6 (no longer USB-routes to SP in this preset)
 *   T7–8 internal; Project ch16 observed by Section Bridge (never forwarded as notes)
 *
 * If FM1 / H-1 only responds on one channel, remap both tracks to ch5 in Settings
 * (or edit routes) — default preserves track identity: 5→5, 6→6.
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
}

export const STORAGE_KEY_STUDIO_SETUP = 'dawlessdaw.studioSetup.v1';

export function buildMyStudioRoutes(ports: {
  circuitIn: string;
  mpcOut: string;
  spOut: string;
  fm1Out: string;
  /** default false — clock stays on hardware thru */
  forwardClock?: boolean;
}): MidiRoute[] {
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
    {
      id: 'mystudio-t5-fm1',
      name: 'Circuit T5 → FM1 ch5',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.fm1Out }],
      channel: { allow: [5], remap: { 5: 5 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
    {
      id: 'mystudio-t6-fm1',
      name: 'Circuit T6 → FM1 ch6',
      enabled: true,
      sourcePortId: ports.circuitIn,
      destinations: [{ portId: ports.fm1Out }],
      channel: { allow: [6], remap: { 6: 6 } },
      forwardClock: false,
      blockKinds: ['program-change'],
    },
  ];

  // Tracks 7–8 intentionally omitted (internal Circuit only).

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
