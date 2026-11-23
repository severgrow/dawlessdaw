import {
  AssistantToolRegistry,
  buildNoteOff,
  buildNoteOn,
  isClockLike,
  parseMidiMessage,
  type MidiMessage,
} from '@dawlessdaw/core';
import {
  CircuitIntelligenceEngine,
  CircuitMirrorEngine,
  ClockHealthMonitor,
  SequencerEngine,
  type CircuitIntelligenceSnapshot,
  type ClockHealthSnapshot,
  type SeqClockSource,
  type SeqEngineSnapshot,
  type SeqScheduledNote,
  type SeqStep,
} from '@dawlessdaw/sequencer';
import { StudioEventBus } from '@dawlessdaw/events';
import {
  NativeBridgeTransport,
  WebMidiTransport,
  type HardwareTransport,
} from '@dawlessdaw/midi';
import { MidiRoutingEngine, type MidiRoute } from '@dawlessdaw/routing';
import { FocusEngine } from '@dawlessdaw/focus';
import {
  BENCH_TESTS,
  CircuitRhythmInterpreter,
  DEFAULT_SECTION_BRIDGE,
  DeviceRegistry,
  MPC_CONTROL_CHANNEL,
  MPC_MUTE_LEARN_CC,
  MPC_MUTE_LEARN_CHANNEL,
  SP_PATTERN_PC_CHANNEL,
  MY_STUDIO_ROLES,
  DEFAULT_SP_NOTE_OFFSET,
  SP_MODE_A_PAD1_NOTE,
  STORAGE_KEY_STUDIO_SETUP,
  assignPort,
  buildBenchExport,
  buildMyStudioRoutes,
  buildPanicMessages,
  emptyBenchResults,
  latencyVerdict,
  matchPortsToRoles,
  BUILTIN_PRESETS,
  CIRCUIT_MACRO_CCS,
  DEVICE_NAME,
  SuperMacroEngine,
  buildControllerRoutes,
  bumpCircuitTick,
  clonePreset,
  controlMappingKey,
  CONTROLLER_KNOB_PICKUP_KEY,
  copyTrack,
  describeIncoming,
  destChannel,
  emptyCircuitLiveTicks,
  emptyProjectGrid,
  isLearnGlassIgnoredMidi,
  knobTarget,
  myStudioPreset,
  normalizeProjectGrid,
  CIRCUIT_PROJECTS_STORAGE_KEY,
  ploeLiveV1Preset,
  presetFromTrackPlan,
  resolveControlMapping,
  sanitizePreset,
  slotCc,
  swapKnobs,
  type CircuitLiveTicks,
  type CircuitProjectSlot,
  type ControllerPreset,
  type CtrlDevice,
  type CtrlTrack,
  type KnobSlot,
  type MacroSceneBank,
  type ResolvedControlMapping,
  type SuperMacro,
  type SuperMacroSnapshot,
  type SuperMacroTrafficConfig,
  legacyTrackPlan,
  sanitizeTrackPlan,
  setTrackSend as withTrackSend,
  trackPreset,
  migrateClockForwarding,
  mpcClockPortAdvice,
  MY_STUDIO_CHANNEL_REMAP,
  normalizePortId,
  portsForRoles,
  resolveSectionBridge,
  addControl,
  applyLearnToControl,
  createGenericProfile,
  exportProfileBundleJson,
  importProfileBundleJson,
  loadCustomProfiles,
  nextOnboardingStep,
  plainClockHint,
  removeControl,
  restoreCustomProfilePorts,
  saveCustomProfiles,
  type DeviceCategory,
  type GenericDeviceProfile,
  type OnboardingStep,
  type ProfileHonesty,
  type BenchExport,
  type BenchTestResult,
  type BenchVerdict,
  type CircuitInterpretation,
  type CircuitT1to4Target,
  type Fm1Firmware,
  type MpcNoteMode,
  type PersistedStudioSetup,
  type TrackDestId,
  type TrackPlan,
  type TrackPresetId,
  type PortAssignment,
  type SectionBridgeConfig,
  type StudioRoleId,
} from '@dawlessdaw/devices';
import {
  ConfigurableArrangerProvider,
  RoleResolver,
  SceneStore,
  validateScene,
  type StudioScene,
} from '@dawlessdaw/scenes';
import {
  createEmptySession,
  exportSessionJson,
  importSessionJson,
  type DawlessdawSession,
} from '@dawlessdaw/sessions';
import { MemoryRepository } from '@dawlessdaw/storage';
import { getPerformanceMemory } from '../recorder/performanceMemory';
import type { PerformanceTimelineEvent } from '@dawlessdaw/sequencer';
import { getFlipEngine } from '../flip/flipEngine';
import { hardwareLabelForChannel } from '../flip/midiGuide';

/** Rig · Controller · Sequencer · Samples · Sections · Circuit · Sessions · Test · Setup · Timing. */
export type WorkspaceId =
  | 'rig'
  | 'controller'
  | 'sequencer'
  | 'samples'
  | 'sections'
  | 'circuit'
  | 'sessions'
  | 'test'
  | 'setup'
  | 'timing'
  | 'macros';

export interface StudioRuntimeSnapshot {
  /** True once Chrome granted Web MIDI access. */
  midiReady: boolean;
  /** Why Web MIDI could not start (null when ready or not yet tried). */
  midiError: string | null;
  transportKind: HardwareTransport['kind'];
  devices: ReturnType<DeviceRegistry['list']>;
  ports: ReturnType<HardwareTransport['listPorts']>;
  routes: MidiRoute[];
  clockAuthorityPortId: string | null;
  focus: ReturnType<FocusEngine['getState']>;
  roles: ReturnType<RoleResolver['getBindings']>;
  arranger: ReturnType<ConfigurableArrangerProvider['getConfig']>;
  scenes: StudioScene[];
  activeSceneId: string | null;
  session: DawlessdawSession;
  workspace: WorkspaceId;
  statusLine: string;
  recentUiEvents: { type: string; summary: string; at: number }[];
  lastCircuitGesture: CircuitInterpretation | null;
  assignments: PortAssignment[];
  /** App forwards Circuit clock/start/stop/continue (+ SPP) to the MPC's output (e.g. Scarlett → MPC DIN In). */
  clockToMpc: boolean;
  /** App forwards Circuit clock/start/stop/continue (+ SPP) to the SP (normally off: SP uses the thru box). */
  clockToSp: boolean;
  /** True when any device gets app clock (Circuit input is then the clock authority). */
  anyClockForwarding: boolean;
  fm1Firmware: Fm1Firmware;
  mpcNoteMode: MpcNoteMode;
  forwardClockToFm1: boolean;
  circuitT1to4Target: CircuitT1to4Target;
  /** Effective per-track sends (Rig grid). */
  trackPlan: TrackPlan;
  /** performance.now() of the last note-on per Circuit track (index = track 1–8). */
  trackActivity: number[];
  /** performance.now() of the last note sent to each device. */
  destActivity: Record<TrackDestId, number>;
  activeBenchId: string | null;
  /** Circuit Controller: the working preset (what routes are built from). */
  controller: ControllerPreset;
  /** Saved presets (built-ins first). */
  controllerPresets: ControllerPreset[];
  /** Which saved preset the working copy came from; `controllerDirty` = changed since. */
  controllerSavedId: string;
  controllerDirty: boolean;
  controllerUndoCount: number;
  /** What the app is waiting for: the first note of a track, or a knob twist. */
  controllerLearn: { kind: 'first-note'; track: number } | { kind: 'twist'; track: number; knob: number } | null;
  /** Last value seen from each Circuit macro knob, per track (index track-1, knob). */
  knobValues: number[][];
  /** Last knob moved: track 1–8, knob 0–7, time. */
  lastKnob: { track: number; knob: number; at: number } | null;
  /** Circuit track the last note/knob came from (= track selected on the Circuit). */
  activeCircuitTrack: number | null;
  /** Last 10 plain-English events, newest first. */
  ctrlEvents: { text: string; device: CtrlDevice | null; at: number }[];
  /**
   * Dark glass learn popup for the last Circuit user control (macro / mixer).
   * Null when closed. Clock / SysEx never open this.
   */
  midiLearnGlass: {
    mapping: ResolvedControlMapping;
    at: number;
    learnReassign: boolean;
    pinned: boolean;
  } | null;
  /** When > Date.now(), glass stays closed (“don’t show for 10s”). */
  midiLearnSnoozeUntil: number;
  spNoteOffset: number;
  learningSpPadOffset: boolean;
  sectionBridge: SectionBridgeConfig;
  /** Last Circuit Project change heard (Program Change ch16). */
  lastProject: { index: number; kind: string; matched: boolean; at: number } | null;
  benchResults: BenchTestResult[];
  benchDetections: string[];
  latencyStats: { samples: number; meanMs: number; jitterMs: number; message: string } | null;
  capturingSceneMidi: boolean;
  /** Throttled USB clock monitor (Circuit in → MPC/SP out when app forwarding is on). */
  clockActivity: {
    lastInKind: string | null;
    lastInAt: number | null;
    inTicks: number;
    inClock: number;
    inStart: number;
    inStop: number;
    inContinue: number;
    lastOutKind: string | null;
    lastOutAt: number | null;
    outTicks: number;
    outClock: number;
    outStart: number;
    outStop: number;
    outContinue: number;
    forwarding: boolean;
    /** Plain-English read of IN/OUT for USB-only clock debug. */
    hint: string;
  };
  /** BPM from Circuit MIDI clock (24 PPQN), when clock is heard. */
  estimatedBpm: number | null;
  /** User-defined / unknown-device profiles (localStorage). */
  customProfiles: GenericDeviceProfile[];
  /** Live port binding for each custom profile id. */
  customBindings: Record<
    string,
    { inputPortId: string | null; outputPortId: string | null; ambiguous: boolean }
  >;
  /** Waiting for next CC on a custom profile control (MIDI Learn). */
  genericLearn: { profileId: string; controlId: string } | null;
  /** Connect → Identify → Assign → Play guidance. */
  onboarding: { step: OnboardingStep; message: string };
  /** Dawlessdaw 8×16 sequencer (not Circuit's internal patterns). */
  sequencer: SeqEngineSnapshot;
  sequencerSelected: { track: number; step: number };
  /**
   * Circuit Intelligence (passive) — last-touched, activity guesses, musical position.
   * Experimental until Patryk confirms on hardware. Never drives outbound MIDI.
   */
  circuitIntelligence: CircuitIntelligenceSnapshot;
  /**
   * Clock Health (Timing Lab Stage A) — passive MIDI clock quality.
   * Not a clock master. Experimental until hardware confirm.
   */
  clockHealth: ClockHealthSnapshot;
  /**
   * Cross-device Super Macros (Milestone 3) — opt-in fan-out + A/B morph.
   * Experimental until hardware confirm. Does not replace Controller MIDI Learn.
   */
  superMacros: SuperMacroSnapshot;
  /**
   * Phase 2 — live Note / CC / PC / Clock ticks from Circuit USB in.
   * Lights the setup checklist as messages arrive. Experimental until hardware.
   */
  circuitLiveTicks: CircuitLiveTicks;
  /** Phase 2 — 64 Project slots with user names / colours. */
  circuitProjects: CircuitProjectSlot[];
  /**
   * Phase 2 — Controller knob soft takeover (promotes Super Macro direct → pickup).
   * **Off by default.**
   */
  controllerKnobPickup: boolean;
}

type Listener = () => void;

/** Accept saved Section Bridge rows only if they look right. */
function sanitizeSectionBridge(raw: unknown): SectionBridgeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { enabled?: unknown; rows?: unknown; eventActionsEnabled?: unknown };
  if (!Array.isArray(r.rows)) return null;
  const num = (v: unknown, lo: number, hi: number): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const rows = r.rows.flatMap((x) => {
    const row = x as Record<string, unknown>;
    const projectIndex = num(row.projectIndex, 1, 64);
    if (projectIndex == null) return [];
    return [
      {
        projectIndex,
        spProgramChange: num(row.spProgramChange, 0, 127),
        mpcProgramChange: num(row.mpcProgramChange, 0, 127),
        sceneId: typeof row.sceneId === 'string' ? row.sceneId : null,
        label: typeof row.label === 'string' ? row.label.slice(0, 40) : undefined,
      },
    ];
  });
  return {
    enabled: Boolean(r.enabled),
    // Default OFF — Performance Memory must never silently drive SP/MPC fills.
    eventActionsEnabled: r.eventActionsEnabled === true,
    rows,
  };
}

function loadCircuitProjects(): CircuitProjectSlot[] {
  try {
    const raw = localStorage.getItem(CIRCUIT_PROJECTS_STORAGE_KEY);
    if (!raw) return emptyProjectGrid();
    return normalizeProjectGrid(JSON.parse(raw) as unknown);
  } catch {
    return emptyProjectGrid();
  }
}

function saveCircuitProjects(slots: CircuitProjectSlot[]): void {
  try {
    localStorage.setItem(CIRCUIT_PROJECTS_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    /* ignore */
  }
}

function loadControllerKnobPickup(): boolean {
  try {
    return localStorage.getItem(CONTROLLER_KNOB_PICKUP_KEY) === '1';
  } catch {
    return false;
  }
}

/** MPC channel (9–12) → Circuit track channel (1–4), from the My Studio remap. */
const MPC_CHANNEL_TO_CIRCUIT: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(MY_STUDIO_CHANNEL_REMAP)
    .filter(([from]) => Number(from) >= 1 && Number(from) <= 4)
    .map(([from, to]) => [to, Number(from)]),
);

function loadSetup(): PersistedStudioSetup | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY_STUDIO_SETUP);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedStudioSetup;
  } catch {
    return null;
  }
}

function saveSetup(setup: PersistedStudioSetup): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_STUDIO_SETUP, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

const CIRCUIT_INTEL_AUTOFOCUS_KEY = 'dawlessdaw.circuitIntel.autoFocus';
const SUPER_MACROS_KEY = 'dawlessdaw.superMacros.v1';

function loadSuperMacrosState(): {
  macros: SuperMacro[];
  scenes: MacroSceneBank;
  traffic: SuperMacroTrafficConfig;
} | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SUPER_MACROS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      macros: SuperMacro[];
      scenes: MacroSceneBank;
      traffic: SuperMacroTrafficConfig;
    };
  } catch {
    return null;
  }
}

function saveSuperMacrosState(state: {
  macros: SuperMacro[];
  scenes: MacroSceneBank;
  traffic: SuperMacroTrafficConfig;
}): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SUPER_MACROS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function loadCircuitIntelAutoFocus(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const v = localStorage.getItem(CIRCUIT_INTEL_AUTOFOCUS_KEY);
    if (v === null) return true;
    return v !== '0';
  } catch {
    return true;
  }
}

function saveCircuitIntelAutoFocus(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CIRCUIT_INTEL_AUTOFOCUS_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Owns transports, routing, focus, devices, scenes — single studio brain.
 */
export class StudioRuntime {
  readonly bus = new StudioEventBus();
  readonly registry = new DeviceRegistry();
  readonly focus = new FocusEngine(this.bus);
  readonly roles = new RoleResolver();
  readonly arranger = new ConfigurableArrangerProvider();
  readonly scenes = new SceneStore();
  readonly assistant = new AssistantToolRegistry();
  readonly sessionRepo = new MemoryRepository<DawlessdawSession>();

  private transport: HardwareTransport;
  private routing: MidiRoutingEngine;
  private midiReady = false;
  private midiError: string | null = null;
  private session: DawlessdawSession = createEmptySession('My Studio', false);
  private workspace: WorkspaceId = 'rig';
  private statusLine = 'Starting Web MIDI…';
  private recentUiEvents: StudioRuntimeSnapshot['recentUiEvents'] = [];
  private lastCircuitGesture: CircuitInterpretation | null = null;
  private circuitInterpreter = new CircuitRhythmInterpreter();
  private assignments: PortAssignment[] = MY_STUDIO_ROLES.map((r) => ({
    roleId: r.id,
    inputPortId: null,
    outputPortId: null,
    connected: r.id === 'zed',
  }));
  private clockToMpc = false;
  private clockToSp = false;
  private fm1Firmware: Fm1Firmware = 'skiff';
  private mpcNoteMode: MpcNoteMode = 'usb';
  private forwardClockToFm1 = false;
  private circuitT1to4Target: CircuitT1to4Target = 'mpc';
  /** null = follow the older settings (circuitT1to4Target + fm1Firmware). */
  private trackPlan: TrackPlan | null = null;
  private trackActivity: number[] = Array(9).fill(0);
  private lastProject: StudioRuntimeSnapshot['lastProject'] = null;
  private controller: ControllerPreset = clonePreset(ploeLiveV1Preset());
  private controllerPresets: ControllerPreset[] = [];
  private controllerSavedId = BUILTIN_PRESETS[0]!.id; // Ploe Live v1
  private controllerHistory: ControllerPreset[] = [];
  private controllerLearn: StudioRuntimeSnapshot['controllerLearn'] = null;
  private knobValues: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  private lastKnob: StudioRuntimeSnapshot['lastKnob'] = null;
  private activeCircuitTrack: number | null = null;
  private ctrlEvents: StudioRuntimeSnapshot['ctrlEvents'] = [];
  private ctrlNotifyAt = 0;
  private midiLearnGlass: StudioRuntimeSnapshot['midiLearnGlass'] = null;
  private midiLearnSnoozeUntil = 0;
  private midiLearnDebounce: ReturnType<typeof setTimeout> | null = null;
  private midiLearnPending: ResolvedControlMapping | null = null;
  private midiLearnHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Preset snapshot when the glass opened — Cancel restores this. */
  private midiLearnBaseline: ControllerPreset | null = null;
  private testTimers: ReturnType<typeof setTimeout>[] = [];
  private destActivity: Record<TrackDestId, number> = { mpc: 0, sp: 0, fm1: 0 };
  private spNoteOffset = DEFAULT_SP_NOTE_OFFSET;
  private learningSpPadOffset = false;
  private sectionBridge: SectionBridgeConfig = {
    ...DEFAULT_SECTION_BRIDGE,
    rows: DEFAULT_SECTION_BRIDGE.rows.map((r) => ({ ...r })),
  };
  private benchResults: BenchTestResult[] = emptyBenchResults();
  private benchDetections: string[] = [];
  private rawMidiLog: BenchExport['rawMidiLog'] = [];
  private latencySamples: number[] = [];
  private latencyStats: StudioRuntimeSnapshot['latencyStats'] = null;
  private pendingNoteIns = new Map<string, number>();
  private capturingSceneMidi = false;
  private captureTimer: ReturnType<typeof setTimeout> | null = null;
  private clockInTicks = 0;
  private clockOutTicks = 0;
  private clockInByKind = { clock: 0, start: 0, stop: 0, continue: 0 };
  private clockOutByKind = { clock: 0, start: 0, stop: 0, continue: 0 };
  private lastClockInKind: string | null = null;
  private lastClockInAt: number | null = null;
  private lastClockOutKind: string | null = null;
  private lastClockOutAt: number | null = null;
  private clockUiNotifyAt = 0;
  private clockLogSample = 0;
  /** Timestamps of recent F8 clocks from Circuit (for BPM). */
  private clockTickTimes: number[] = [];
  private estimatedBpm: number | null = null;
  private activeBenchId: string | null = null;
  private customProfiles: GenericDeviceProfile[] = loadCustomProfiles();
  private customBindings: StudioRuntimeSnapshot['customBindings'] = {};
  private genericLearn: StudioRuntimeSnapshot['genericLearn'] = null;
  private listeners = new Set<Listener>();
  private unsubs: Array<() => void> = [];
  private started = false;
  private sequencer: SequencerEngine;
  private seqUnsub: (() => void) | null = null;
  /** Passive Circuit Live observer — Circuit input MIDI only; never routes out. */
  private circuitMirror = new CircuitMirrorEngine();
  /**
   * Passive Circuit Intelligence — analysis after routing; never emits MIDI.
   * Auto-focus preference from localStorage (`dawlessdaw.circuitIntel.autoFocus`).
   */
  private circuitIntel = new CircuitIntelligenceEngine({
    autoFocus: loadCircuitIntelAutoFocus(),
  });
  private intelUnsub: (() => void) | null = null;
  /** Passive Clock Health — Timing Lab Stage A. */
  private clockHealth = new ClockHealthMonitor();
  private clockHealthUnsub: (() => void) | null = null;
  /** Opt-in Super Macros — Milestone 3. */
  private superMacros = new SuperMacroEngine();
  private superMacroUnsub: (() => void) | null = null;
  private superMacroFlushTimer: ReturnType<typeof setInterval> | null = null;
  private superMacroMorphTimer: ReturnType<typeof setInterval> | null = null;
  /** Phase 2 Circuit live ticks + project grid + Controller soft takeover. */
  private circuitLiveTicks: CircuitLiveTicks = emptyCircuitLiveTicks();
  private circuitProjects: CircuitProjectSlot[] = loadCircuitProjects();
  private controllerKnobPickup = loadControllerKnobPickup();

  constructor() {
    this.transport = new WebMidiTransport();
    this.routing = new MidiRoutingEngine(this.transport, this.bus);
    this.sequencer = new SequencerEngine({
      onNote: (note) => this.fireSequencerNote(note),
      onAllNotesOff: () => this.routing.allNotesOff(),
    });
    this.seqUnsub = this.sequencer.subscribe(() => this.notify());
    this.intelUnsub = this.circuitIntel.subscribe(() => {
      this.ingestPerformanceMemoryFromIntel();
      this.notify();
    });
    this.clockHealthUnsub = this.clockHealth.subscribe(() => this.notify());
    this.superMacroUnsub = this.superMacros.subscribe(() => this.notify());
    this.superMacros.setControllerPickup(this.controllerKnobPickup);
    const savedMacros = loadSuperMacrosState();
    if (savedMacros?.macros) this.superMacros.setMacros(savedMacros.macros);
    if (savedMacros?.scenes) this.superMacros.setScenes(savedMacros.scenes);
    if (savedMacros?.traffic) this.superMacros.setTraffic(savedMacros.traffic);
    // Dev/smoke helper: drive Circuit Mirror from Playwright without outbound MIDI.
    if (typeof window !== 'undefined') {
      (window as unknown as { __splotCircuitMirror?: CircuitMirrorEngine }).__splotCircuitMirror =
        this.circuitMirror;
      (window as unknown as { __splotCircuitIntel?: CircuitIntelligenceEngine }).__splotCircuitIntel =
        this.circuitIntel;
      (window as unknown as { __splotClockHealth?: ClockHealthMonitor }).__splotClockHealth =
        this.clockHealth;
      (window as unknown as { __splotSuperMacros?: SuperMacroEngine }).__splotSuperMacros =
        this.superMacros;
    }
    getFlipEngine().setMidiLabelFn((channel, note) => {
      const base = hardwareLabelForChannel(channel, this.controller.tracks, DEVICE_NAME);
      return `${base} · n${note}`;
    });
    const saved = loadSetup();
    if (saved?.assignments?.length) {
      // Strip mock / dash sentinels so Live sync can auto-bind Felucca → FM1.
      this.assignments = saved.assignments.map((a) => {
        const inputPortId = normalizePortId(a.inputPortId);
        const outputPortId = normalizePortId(a.outputPortId);
        return {
          ...a,
          inputPortId,
          outputPortId,
          connected: a.roleId === 'zed' || Boolean(inputPortId || outputPortId),
        };
      });
    }
    if (saved) {
      // Version-1 saves had one switch for MPC + SP: ON becomes MPC ON, SP OFF.
      const clock = migrateClockForwarding(saved);
      this.clockToMpc = clock.mpc;
      this.clockToSp = clock.sp;
      this.fm1Firmware = saved.fm1Firmware === 'h1' ? 'h1' : 'skiff';
      this.mpcNoteMode = saved.mpcNoteMode === 'din-only' ? 'din-only' : 'usb';
      this.forwardClockToFm1 = clock.fm1;
      const t = saved.circuitT1to4Target;
      this.circuitT1to4Target = t === 'sp' || t === 'both' ? t : 'mpc';
      this.trackPlan = sanitizeTrackPlan(saved.trackPlan);
      // Circuit Controller: saved working copy, else migrate an older Rig-grid plan.
      this.controllerPresets = (Array.isArray(saved.controllerPresets) ? saved.controllerPresets : [])
        .map((x) => sanitizePreset(x))
        .filter((x): x is ControllerPreset => x !== null)
        .slice(0, 50);
      const working = sanitizePreset(saved.controller);
      if (working) {
        this.controller = working;
        this.controllerSavedId = typeof saved.controllerSavedId === 'string' ? saved.controllerSavedId : working.id;
      } else if (this.trackPlan) {
        const migrated = presetFromTrackPlan(this.trackPlan, this.spNoteOffset, this.fm1Firmware);
        this.controller = migrated;
        this.controllerPresets = [clonePreset(migrated), ...this.controllerPresets];
        this.controllerSavedId = migrated.id;
      }
      const bridge = sanitizeSectionBridge(saved.sectionBridge);
      if (bridge) this.sectionBridge = bridge;
      getPerformanceMemory().setPrefs({
        sectionEventActionsEnabled: this.sectionBridge.eventActionsEnabled === true,
      });
      if (typeof saved.spNoteOffset === 'number' && Number.isFinite(saved.spNoteOffset)) {
        this.spNoteOffset = Math.max(-127, Math.min(127, Math.round(saved.spNoteOffset)));
      }
    }
    this.registerDefaultAssistantTools();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): StudioRuntimeSnapshot {
    return {
      midiReady: this.midiReady,
      midiError: this.midiError,
      transportKind: this.transport.kind,
      devices: this.registry.list(),
      ports: this.transport.listPorts(),
      routes: this.routing.getRoutes(),
      clockAuthorityPortId: this.routing.getClockAuthority(),
      focus: this.focus.getState(),
      roles: this.roles.getBindings(),
      arranger: this.arranger.getConfig(),
      scenes: this.scenes.list(),
      activeSceneId: this.scenes.getActiveId(),
      session: this.session,
      workspace: this.workspace,
      statusLine: this.statusLine,
      recentUiEvents: [...this.recentUiEvents],
      lastCircuitGesture: this.lastCircuitGesture,
      assignments: this.assignments.map((a) => ({ ...a })),
      clockToMpc: this.clockToMpc,
      clockToSp: this.clockToSp,
      anyClockForwarding: this.anyClockForwarding(),
      fm1Firmware: this.fm1Firmware,
      mpcNoteMode: this.mpcNoteMode,
      forwardClockToFm1: this.forwardClockToFm1,
      circuitT1to4Target: this.circuitT1to4Target,
      trackPlan: this.effectiveTrackPlan(),
      trackActivity: [...this.trackActivity],
      destActivity: { ...this.destActivity },
      activeBenchId: this.activeBenchId,
      controller: clonePreset(this.controller),
      controllerPresets: [...BUILTIN_PRESETS, ...this.controllerPresets].map(clonePreset),
      controllerSavedId: this.controllerSavedId,
      controllerDirty: this.controllerDirty(),
      controllerUndoCount: this.controllerHistory.length,
      controllerLearn: this.controllerLearn,
      knobValues: this.knobValues.map((r) => [...r]),
      lastKnob: this.lastKnob ? { ...this.lastKnob } : null,
      activeCircuitTrack: this.activeCircuitTrack,
      ctrlEvents: [...this.ctrlEvents],
      midiLearnGlass: this.midiLearnGlass
        ? {
            mapping: { ...this.midiLearnGlass.mapping },
            at: this.midiLearnGlass.at,
            learnReassign: this.midiLearnGlass.learnReassign,
            pinned: this.midiLearnGlass.pinned,
          }
        : null,
      midiLearnSnoozeUntil: this.midiLearnSnoozeUntil,
      spNoteOffset: this.spNoteOffset,
      learningSpPadOffset: this.learningSpPadOffset,
      lastProject: this.lastProject ? { ...this.lastProject } : null,
      sectionBridge: {
        enabled: this.sectionBridge.enabled,
        eventActionsEnabled: this.sectionBridge.eventActionsEnabled === true,
        rows: this.sectionBridge.rows.map((r) => ({ ...r })),
      },
      benchResults: this.benchResults.map((r) => ({
        ...r,
        detections: [...r.detections],
      })),
      benchDetections: [...this.benchDetections],
      latencyStats: this.latencyStats ? { ...this.latencyStats } : null,
      capturingSceneMidi: this.capturingSceneMidi,
      clockActivity: {
        lastInKind: this.lastClockInKind,
        lastInAt: this.lastClockInAt,
        inTicks: this.clockInTicks,
        inClock: this.clockInByKind.clock,
        inStart: this.clockInByKind.start,
        inStop: this.clockInByKind.stop,
        inContinue: this.clockInByKind.continue,
        lastOutKind: this.lastClockOutKind,
        lastOutAt: this.lastClockOutAt,
        outTicks: this.clockOutTicks,
        outClock: this.clockOutByKind.clock,
        outStart: this.clockOutByKind.start,
        outStop: this.clockOutByKind.stop,
        outContinue: this.clockOutByKind.continue,
        forwarding: this.anyClockForwarding(),
        hint: this.clockHint(),
      },
      estimatedBpm: this.estimatedBpm,
      customProfiles: this.customProfiles.map((p) => ({
        ...p,
        capabilities: p.capabilities.map((c) => ({ ...c })),
        controls: p.controls.map((c) => ({ ...c })),
        portNameHints: [...p.portNameHints],
      })),
      customBindings: { ...this.customBindings },
      genericLearn: this.genericLearn ? { ...this.genericLearn } : null,
      onboarding: this.computeOnboarding(),
      sequencer: this.sequencer.getSnapshot(),
      sequencerSelected: this.sequencer.getSelected(),
      circuitIntelligence: this.circuitIntel.getSnapshot(),
      clockHealth: this.clockHealth.getSnapshot(),
      superMacros: this.superMacros.getSnapshot(),
      circuitLiveTicks: {
        note: { ...this.circuitLiveTicks.note },
        cc: { ...this.circuitLiveTicks.cc },
        pc: { ...this.circuitLiveTicks.pc },
        clock: { ...this.circuitLiveTicks.clock },
      },
      circuitProjects: this.circuitProjects.map((s) => ({ ...s })),
      controllerKnobPickup: this.controllerKnobPickup,
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      await this.transport.start();
      this.midiReady = true;
      this.midiError = null;
    } catch (err) {
      this.midiReady = false;
      this.midiError =
        err instanceof Error && /not available/i.test(err.message)
          ? 'This browser has no Web MIDI. Open the app in Chrome.'
          : 'Chrome did not allow MIDI access. Click the icon at the left of the address bar, allow MIDI devices, then reload.';
      this.started = false;
      this.setStatus(`No MIDI — ${this.midiError}`);
      this.notify();
      return;
    }
    this.routing.start();
    this.syncLivePorts(this.transport.listPorts());
    this.applyMyStudioRoutes();

    this.unsubs.push(
      this.transport.onMessage((message) => {
        this.logMidi(message);
        const deviceId = this.registry.deviceForPort(message.portId);
        this.bus.emit({ type: 'midi:in', message, deviceId });
        this.handleIncoming(message, deviceId);
      }),
    );

    this.unsubs.push(
      this.transport.onPortsChanged((ports) => {
        this.syncLivePorts(ports);
        this.applyMyStudioRoutes();
        this.pushBenchDetection('reconnect', `ports changed (${ports.length})`);
        this.notify();
      }),
    );

    this.unsubs.push(
      this.bus.onUi((event) => {
        const summary =
          event.type === 'studio:status'
            ? event.message
            : event.type === 'focus:changed'
              ? `focus → ${event.focus.activeDeviceId ?? 'none'} (${event.reason})`
              : event.type;
        this.recentUiEvents = [
          { type: event.type, summary, at: Date.now() },
          ...this.recentUiEvents,
        ].slice(0, 40);
        this.notify();
      }),
    );

    this.unsubs.push(this.bus.on('focus:changed', () => this.notify()));

    this.unsubs.push(
      this.bus.on('midi:clock', (event) => {
        if (event.type !== 'midi:clock') return;
        this.recordClockActivity(event.message);
        const circuitIn = portsForRoles(this.assignments).circuitIn;
        // Follow Circuit in only — never the forwarded OUT clock (no second competing clock).
        if (circuitIn && event.message.portId === circuitIn) {
          this.sequencer.onMidiClockMessage(event.message.kind, event.message.timestamp);
          // Circuit Mirror: same Circuit-in filter — never forwarded OUT clock.
          this.circuitMirror.onMidiMessage(event.message.kind);
          // Intelligence analysis after mirror — still Circuit-in only; no outbound.
          this.circuitIntel.onMidiTransport(event.message.kind);
          // Clock Health (Timing Lab) — passive; never becomes clock master.
          this.clockHealth.onMidiTransport(event.message.kind, event.message.portId);
          const pos = this.circuitIntel.getSnapshot().position;
          this.clockHealth.setPosition({
            transport: pos.transport,
            bar: pos.bar,
            beat: pos.beat,
            bpm: pos.bpm,
          });
        } else if (
          event.message.kind === 'clock' &&
          event.message.portId &&
          (!circuitIn || event.message.portId !== circuitIn)
        ) {
          // Second input clocking? Hint only for duplicate-source (no BPM from this path).
          this.clockHealth.observeOtherClockPort(event.message.portId);
        }
      }),
    );

    this.setStatus('Live MIDI — clock stays on your thru box unless enabled in Settings');
    this.notify();
  }

  async stop(): Promise<void> {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.routing.stop();
    await this.transport.stop();
    this.started = false;
  }

  /**
   * Re-read Web MIDI ports. Cannot invent devices missing from Audio MIDI Setup.
   */
  async rescanMidiPorts(): Promise<void> {
    if (!this.started) await this.start();
    if (!this.midiReady) return;
    const ports = await this.transport.rescanPorts();
    this.syncLivePorts(ports);
    this.applyMyStudioRoutes();
    const connected = ports.filter((p) => p.state === 'connected').length;
    this.setStatus(
      connected === 0
          ? 'Rescan: no Web MIDI ports — fix Audio MIDI Setup / USB first'
          : `Rescanned Web MIDI (${connected} connected). If MPC still missing, OS does not see it.`,
    );
    this.notify();
  }

  getNativeBridgeStub(): NativeBridgeTransport {
    return new NativeBridgeTransport();
  }

  setWorkspace(workspace: WorkspaceId): void {
    this.workspace = workspace;
    this.notify();
  }

  setRoutes(routes: MidiRoute[]): void {
    this.routing.setRoutes(routes);
    this.persistSetup();
    this.notify();
  }

  setClockAuthority(portId: string | null): void {
    if (this.anyClockForwarding()) {
      const circuitIn = portsForRoles(this.assignments).circuitIn;
      // Any app clock forwarding always locks authority to Circuit in
      this.routing.setClockAuthority(circuitIn);
      this.setStatus(
        circuitIn
          ? 'Clock authority locked to Circuit (app clock forwarding ON)'
          : 'Assign Circuit input before app clock forwarding can lock authority',
      );
      this.notify();
      return;
    }
    this.routing.setClockAuthority(portId);
    this.notify();
  }

  /** Circuit transport → MPC Out (Scarlett→DIN): clock/start/stop/continue + SPP if Circuit sends it. */
  setClockToMpc(on: boolean): void {
    this.clockToMpc = on;
    this.resetClockActivity();
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? this.mpcNoteMode === 'din-only'
          ? 'MPC follows Circuit Play is ON but has no effect: MPC is set to "MIDI cable from thru box only"'
          : 'MPC follows Circuit Play ON — transport on MPC Out (use Scarlett→DIN; Receive MIDI Clock on MPC MIDI In)'
        : 'MPC follows Circuit Play OFF',
    );
    this.notify();
  }

  /** Circuit transport → SP output. Off by default: the SP gets clock from the thru box. */
  setClockToSp(on: boolean): void {
    this.clockToSp = on;
    this.resetClockActivity();
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? 'Circuit transport → SP ON — SP may get double clock if it is still on the thru box'
        : 'Circuit transport → SP OFF (SP follows the thru box)',
    );
    this.notify();
  }

  private anyClockForwarding(): boolean {
    return this.clockToMpc || this.clockToSp || this.forwardClockToFm1;
  }

  setFm1Firmware(firmware: Fm1Firmware): void {
    this.fm1Firmware = firmware;
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      firmware === 'skiff'
        ? 'FM1 = Skiff: Circuit T5–T8 → FM1 ch5–8, macros + Mixer Level→CC7'
        : 'FM1 = h1: Circuit T5–T6 → FM1, notes only',
    );
    this.notify();
  }

  setMpcNoteMode(mode: MpcNoteMode): void {
    this.mpcNoteMode = mode;
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      mode === 'din-only'
        ? 'MPC: MIDI cable from thru box only — the app sends the MPC nothing (notes or clock)'
        : 'App sends notes to the MPC — Circuit T1–T4 → MPC ch9–12 via the MPC Out port',
    );
    this.notify();
  }

  setForwardClockToFm1(on: boolean): void {
    this.forwardClockToFm1 = on;
    this.resetClockActivity();
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? 'Circuit clock → FM1 over USB ON (set Skiff CLOCK = USB)'
        : 'Circuit clock → FM1 OFF',
    );
    this.notify();
  }

  /** The plan in use: the Rig grid's own, or the one the older settings describe. */
  private effectiveTrackPlan(): TrackPlan {
    return this.trackPlan ?? legacyTrackPlan(this.circuitT1to4Target, this.fm1Firmware);
  }

  /** Rig grid: send Circuit `track` to `dest` on `channel` (null = stop sending). */
  setTrackSend(track: number, dest: TrackDestId, channel: number | null): void {
    this.trackPlan = withTrackSend(this.effectiveTrackPlan(), track, dest, channel);
    this.applyMyStudioRoutes();
    this.persistSetup();
    const name = dest === 'mpc' ? 'MPC' : dest === 'sp' ? 'SP' : 'FM1';
    this.setStatus(
      channel == null ? `Circuit T${track} no longer plays the ${name}` : `Circuit T${track} → ${name} ch${channel}`,
    );
    this.notify();
  }

  applyTrackPreset(id: TrackPresetId): void {
    this.trackPlan = trackPreset(id);
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(`Track routing preset applied`);
    this.notify();
  }

  /** Called for every note the app sends: lights the device's activity LED. */
  recordOutActivity(portId: string): void {
    const p = portsForRoles(this.assignments);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (portId === p.mpcOut) this.destActivity.mpc = now;
    else if (portId === p.spOut) this.destActivity.sp = now;
    else if (portId === p.fm1Out) this.destActivity.fm1 = now;
  }

  setCircuitT1to4Target(target: CircuitT1to4Target): void {
    this.circuitT1to4Target = target;
    this.applyMyStudioRoutes();
    this.persistSetup();
    const label =
      target === 'sp'
        ? 'Circuit T1–T4 → SP banks A–D (SP must be in MIDI Mode A)'
        : target === 'both'
          ? 'Circuit T1–T4 → MPC and SP banks A–D'
          : 'Circuit T1–T4 → MPC';
    this.setStatus(label);
    this.notify();
  }

  setSpNoteOffset(offset: number): void {
    this.spNoteOffset = Math.max(-127, Math.min(127, Math.round(offset)));
    this.learningSpPadOffset = false;
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(`SP note offset ${this.spNoteOffset >= 0 ? '+' : ''}${this.spNoteOffset}`);
    this.notify();
  }

  /** Next Circuit note on ch1–4 becomes SP pad 1. */
  learnSpPadOffset(): void {
    this.learningSpPadOffset = true;
    this.setStatus('Learn: play the note on Circuit track 1–4 that should hit SP pad 1');
    this.notify();
  }

  setFocusMode(mode: 'follow' | 'smart' | 'manual'): void {
    this.focus.setMode(mode);
    this.notify();
  }

  pinDevice(deviceId: string | null): void {
    this.focus.pin(deviceId);
    this.notify();
  }

  selectDevice(deviceId: string): void {
    this.focus.select(deviceId);
    this.notify();
  }

  assignStudioPort(roleId: StudioRoleId, which: 'input' | 'output', portId: string | null): void {
    this.assignments = assignPort(
      this.assignments,
      roleId,
      which,
      portId,
      this.transport.listPorts(),
    );
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.notify();
  }

  // —— Dawlessdaw Sequencer (8×16) ——

  /**
   * Route a scheduled note through existing Controller destinations via the
   * routing engine (Circuit track channel as source). Does not emit MIDI clock.
   */
  private fireSequencerNote(note: SeqScheduledNote): void {
    const circuitIn = portsForRoles(this.assignments).circuitIn;
    if (!circuitIn) return;
    const onData = buildNoteOn(note.track, note.pitch, note.velocity);
    this.routing.inject(parseMidiMessage(onData, note.time, circuitIn));
    const offData = buildNoteOff(note.track, note.pitch, 0);
    this.routing.inject(parseMidiMessage(offData, note.time + note.durationMs, circuitIn));
  }

  seqPlay(): void {
    this.sequencer.play();
    const src = this.sequencer.getSnapshot().bank.clockSource;
    this.setStatus(
      src === 'circuit'
        ? 'Sequencer Play — following Circuit clock (Start/Stop/Continue forwarded as usual)'
        : 'Sequencer Play — internal BPM (no MIDI clock out)',
    );
    this.notify();
  }

  seqStop(): void {
    this.sequencer.stop();
    this.setStatus('Sequencer Stop');
    this.notify();
  }

  seqToggleRecord(): void {
    this.sequencer.toggleRecording();
    const on = this.sequencer.getSnapshot().recording;
    this.setStatus(
      on
        ? 'Record ON — Circuit notes land on the current step (Live MIDI Activity)'
        : 'Record OFF',
    );
    this.notify();
  }

  seqSetClockSource(source: SeqClockSource): void {
    this.sequencer.setClockSource(source);
    this.setStatus(
      source === 'circuit'
        ? 'Sequencer clock: Circuit (default master)'
        : 'Sequencer clock: internal BPM — does not emit MIDI clock',
    );
    this.notify();
  }

  seqSetActivePattern(index: number): void {
    this.sequencer.setActivePattern(index);
    this.notify();
  }

  seqSetLength(length: number): void {
    this.sequencer.setLength(length);
    this.notify();
  }

  seqSetBpm(bpm: number): void {
    this.sequencer.setBpm(bpm);
    this.notify();
  }

  seqClickToggle(track: number, step: number): void {
    this.sequencer.clickToggle(track, step);
    this.notify();
  }

  seqSetStep(
    track: number,
    step: number,
    patch: Partial<Pick<SeqStep, 'pitch' | 'velocity' | 'gate' | 'on'>>,
  ): void {
    this.sequencer.setStep(track, step, patch);
    this.notify();
  }

  seqSelectCell(track: number, step: number): void {
    this.sequencer.selectCell(track, step);
    this.notify();
  }

  seqSetTrackMute(track: number, muted: boolean): void {
    this.sequencer.setTrackMute(track, muted);
    this.notify();
  }

  seqSetTrackSolo(track: number, solo: boolean): void {
    this.sequencer.setTrackSolo(track, solo);
    this.notify();
  }

  seqSetTrackDefaults(
    track: number,
    patch: Partial<{ defaultPitch: number; defaultVelocity: number; defaultGate: number }>,
  ): void {
    this.sequencer.setTrackDefaults(track, patch);
    this.notify();
  }

  seqUndo(): void {
    this.sequencer.undo();
    this.setStatus('Sequencer undo');
    this.notify();
  }

  seqRedo(): void {
    this.sequencer.redo();
    this.notify();
  }

  /** Circuit Mirror Live engine — subscribe via getSnapshot / subscribe. Read-only. */
  getCircuitMirror(): CircuitMirrorEngine {
    return this.circuitMirror;
  }

  resetCircuitMirror(): void {
    this.circuitMirror.reset();
  }

  exportCircuitMirrorDiagnostic(): string {
    return JSON.stringify(this.circuitMirror.exportDiagnostic(), null, 2);
  }

  /** Circuit Intelligence — passive analysis; subscribe via getSnapshot. */
  getCircuitIntelligence(): CircuitIntelligenceEngine {
    return this.circuitIntel;
  }

  resetCircuitIntelligence(): void {
    this.circuitIntel.reset();
    this.notify();
  }

  exportCircuitIntelligenceDiagnostic(): string {
    return JSON.stringify(this.circuitIntel.exportDiagnostic(), null, 2);
  }

  setCircuitIntelAutoFocus(on: boolean): void {
    this.circuitIntel.setAutoFocus(on);
    saveCircuitIntelAutoFocus(on);
    this.setStatus(`Circuit auto-focus ${on ? 'on' : 'off'} (macros CC 21–28)`);
    this.notify();
  }

  getClockHealth(): ClockHealthMonitor {
    return this.clockHealth;
  }

  resetClockHealth(): void {
    this.clockHealth.reset();
    this.notify();
  }

  exportClockHealthDiagnostic(): string {
    return JSON.stringify(this.clockHealth.exportDiagnostic(), null, 2);
  }

  /**
   * User-triggered Latency Lab MIDI send — short note only.
   * Does not change routes or apply delay correction.
   */
  sendLatencyLabNote(portId: string, data: Uint8Array): void {
    this.transport.send(portId, data);
    this.bus.emit({
      type: 'midi:out',
      message: parseMidiMessage(data, performance.now(), portId),
    });
  }

  getSuperMacros(): SuperMacroEngine {
    return this.superMacros;
  }

  setSuperMacros(macros: SuperMacro[]): void {
    this.superMacros.setMacros(macros);
    this.persistSuperMacros();
    this.ensureSuperMacroTimers();
    this.notify();
  }

  setSuperMacroScenes(scenes: MacroSceneBank): void {
    this.superMacros.setScenes(scenes);
    this.persistSuperMacros();
    this.notify();
  }

  setSuperMacroTraffic(cfg: Partial<SuperMacroTrafficConfig>): void {
    this.superMacros.setTraffic(cfg);
    this.persistSuperMacros();
    this.notify();
  }

  captureSuperMacroScene(which: 'a' | 'b'): void {
    this.superMacros.captureScene(which);
    this.persistSuperMacros();
    this.notify();
  }

  startSuperMacroMorph(to: 'a' | 'b'): void {
    const bar = this.circuitIntel.getSnapshot().position.bar;
    this.superMacros.startMorph(to, {
      barQuantize: this.superMacros.getSnapshot().scenes.barQuantize,
      currentBar: bar,
    });
    getPerformanceMemory().recordMorph({ phase: 'start', to });
    this.ensureSuperMacroTimers();
    this.setStatus(`Morph → scene ${to.toUpperCase()} (Splot-owned, not Circuit Scenes)`);
    this.notify();
  }

  cancelSuperMacroMorph(): void {
    this.superMacros.cancelMorph();
    getPerformanceMemory().recordMorph({ phase: 'cancel' });
    this.setStatus('Macro morph cancelled');
    this.notify();
  }

  panicSuperMacros(): void {
    this.superMacros.panic();
    this.persistSuperMacros();
    this.setStatus('Super Macros panic — output disabled');
    this.notify();
  }

  enableSuperMacrosAfterPanic(): void {
    this.superMacros.enableAfterPanic();
    this.persistSuperMacros();
    this.notify();
  }

  exportSuperMacrosDiagnostic(): string {
    return JSON.stringify(this.superMacros.exportDiagnostic(), null, 2);
  }

  private persistSuperMacros(): void {
    const snap = this.superMacros.getSnapshot();
    saveSuperMacrosState({
      macros: snap.macros,
      scenes: snap.scenes,
      traffic: snap.traffic,
    });
  }

  private ensureSuperMacroTimers(): void {
    if (!this.superMacroFlushTimer) {
      this.superMacroFlushTimer = setInterval(() => {
        const intents = this.superMacros.flushPending();
        this.dispatchSuperMacroIntents(intents);
        const morphIntents = this.superMacros.tickMorph();
        this.dispatchSuperMacroIntents(morphIntents);
      }, 33);
    }
  }

  private dispatchSuperMacroIntents(
    intents: { roleId: 'mpc' | 'sp404' | 'fm1'; channel: number; cc: number; value: number }[],
  ): void {
    if (!intents.length) return;
    const p = portsForRoles(this.assignments);
    for (const intent of intents) {
      const portId =
        intent.roleId === 'mpc' ? p.mpcOut : intent.roleId === 'sp404' ? p.spOut : p.fm1Out;
      if (!portId) continue;
      const data = new Uint8Array([
        0xb0 | ((intent.channel - 1) & 0x0f),
        intent.cc & 0x7f,
        intent.value & 0x7f,
      ]);
      this.transport.send(portId, data);
      this.bus.emit({
        type: 'midi:out',
        message: parseMidiMessage(data, performance.now(), portId),
      });
    }
  }

  // —— Circuit Controller ——

  private controllerDirty(): boolean {
    const saved = [...BUILTIN_PRESETS, ...this.controllerPresets].find((p) => p.id === this.controllerSavedId);
    if (!saved) return true;
    return (
      JSON.stringify({ t: saved.tracks, s: saved.skiffChannels }) !==
      JSON.stringify({ t: this.controller.tracks, s: this.controller.skiffChannels })
    );
  }

  private pushControllerHistory(): void {
    this.controllerHistory = [...this.controllerHistory.slice(-19), clonePreset(this.controller)];
  }

  /** Every controller edit goes through here: undo point, routes, save, redraw. */
  private changeController(next: ControllerPreset, status?: string): void {
    this.pushControllerHistory();
    this.controller = next;
    this.applyMyStudioRoutes();
    this.persistSetup();
    // Keep the open glass in sync with the new mapping (same control, fresh detail).
    if (this.midiLearnGlass) {
      const m = this.midiLearnGlass.mapping;
      const refreshed = resolveControlMapping(this.controller, {
        kind: 'cc',
        channel: m.sourceChannel,
        controller: m.sourceCc,
        value: m.value,
      });
      if (refreshed) {
        this.midiLearnGlass = { ...this.midiLearnGlass, mapping: refreshed };
      }
    }
    if (status) this.setStatus(status);
    this.notify();
  }

  setControllerTrack(track: number, patch: Partial<CtrlTrack>): void {
    const next = clonePreset(this.controller);
    const cur = next.tracks[track - 1];
    if (!cur) return;
    const changedDevice = patch.dest !== undefined && patch.dest?.device !== cur.dest?.device;
    next.tracks[track - 1] = { ...cur, ...patch };
    // A new device gets a fresh knob page (targets belong to one device).
    if (changedDevice) {
      const dev = patch.dest?.device;
      next.tracks[track - 1]!.knobs = cur.knobs.map((k, i) => ({
        target: dev === 'fm1'
          ? (['fm1.brightness', 'fm1.resonance', 'fm1.attack', 'fm1.decay', 'fm1.release', 'fm1.delay', 'fm1.reverb', 'fm1.level'][i] ?? null)
          : dev === 'mpc'
            ? `mpc.learn${i + 1}`
            : null,
        min: 0,
        max: 127,
        ...(k.target === 'custom' ? {} : {}),
      }));
      if (patch.firstNote === undefined) next.tracks[track - 1]!.firstNote = dev === 'sp' ? 60 : null;
    }
    this.changeController(next);
  }

  setControllerKnob(track: number, knob: number, patch: Partial<KnobSlot>): void {
    const next = clonePreset(this.controller);
    const slot = next.tracks[track - 1]?.knobs[knob];
    if (!slot) return;
    Object.assign(slot, patch);
    if (slot.target !== 'custom') delete slot.cc;
    this.changeController(next);
  }

  setSkiffChannel(skiffTrack: number, channel: number): void {
    const next = clonePreset(this.controller);
    if (skiffTrack < 1 || skiffTrack > 6 || channel < 1 || channel > 16) return;
    next.skiffChannels[skiffTrack - 1] = channel;
    this.changeController(next, `Skiff track ${skiffTrack} now listens on channel ${channel}`);
  }

  copyControllerTrack(from: number, to: number[]): void {
    this.changeController(copyTrack(this.controller, from, to), `Copied T${from} to ${to.map((t) => `T${t}`).join(', ')}`);
  }

  undoController(): void {
    const prev = this.controllerHistory.pop();
    if (!prev) return;
    this.controller = prev;
    this.applyMyStudioRoutes();
    this.persistSetup();
    if (this.midiLearnGlass) {
      const m = this.midiLearnGlass.mapping;
      const refreshed = resolveControlMapping(this.controller, {
        kind: 'cc',
        channel: m.sourceChannel,
        controller: m.sourceCc,
        value: m.value,
      });
      if (refreshed) this.midiLearnGlass = { ...this.midiLearnGlass, mapping: refreshed };
    }
    this.setStatus('Undone');
    this.notify();
  }

  loadControllerPreset(id: string): void {
    const p = [...BUILTIN_PRESETS, ...this.controllerPresets].find((x) => x.id === id);
    if (!p) return;
    this.controllerSavedId = p.id;
    this.changeController({ ...clonePreset(p), builtIn: false }, `Loaded preset “${p.name}”`);
  }

  /** Save over the current preset; built-ins can't be overwritten, so they save as new. */
  saveControllerPreset(): void {
    const idx = this.controllerPresets.findIndex((p) => p.id === this.controllerSavedId);
    if (idx < 0) {
      this.saveControllerPresetAs(`${this.presetName(this.controllerSavedId)} copy`);
      return;
    }
    this.controllerPresets[idx] = { ...clonePreset(this.controller), id: this.controllerSavedId, name: this.controllerPresets[idx]!.name };
    this.persistSetup();
    this.setStatus(`Saved “${this.controllerPresets[idx]!.name}”`);
    this.notify();
  }

  saveControllerPresetAs(name: string): void {
    const id = `preset-${Date.now()}`;
    const clean = name.trim().slice(0, 48) || 'My preset';
    this.controllerPresets = [...this.controllerPresets, { ...clonePreset(this.controller), id, name: clean, builtIn: false }];
    this.controllerSavedId = id;
    this.persistSetup();
    this.setStatus(`Saved as “${clean}”`);
    this.notify();
  }

  renameControllerPreset(id: string, name: string): void {
    const p = this.controllerPresets.find((x) => x.id === id);
    if (!p) return;
    p.name = name.trim().slice(0, 48) || p.name;
    this.persistSetup();
    this.notify();
  }

  deleteControllerPreset(id: string): void {
    this.controllerPresets = this.controllerPresets.filter((p) => p.id !== id);
    if (this.controllerSavedId === id) this.controllerSavedId = BUILTIN_PRESETS[0]!.id;
    this.persistSetup();
    this.notify();
  }

  private presetName(id: string): string {
    return [...BUILTIN_PRESETS, ...this.controllerPresets].find((p) => p.id === id)?.name ?? 'Preset';
  }

  /** Wait for the next note on this track: it becomes the first note (pad 1). */
  learnFirstNote(track: number): void {
    this.controllerLearn = { kind: 'first-note', track };
    this.setStatus(`Play the first note on Circuit track ${track}`);
    this.notify();
  }

  /** Wait for a real knob twist: this slot's setting moves to that knob. */
  twistToPick(track: number, knob: number): void {
    this.controllerLearn = { kind: 'twist', track, knob };
    this.setStatus(`Turn the Circuit knob you want for this setting`);
    this.notify();
  }

  cancelControllerLearn(): void {
    this.controllerLearn = null;
    if (this.midiLearnGlass) {
      this.midiLearnGlass = { ...this.midiLearnGlass, learnReassign: false };
    }
    this.notify();
  }

  /** Close the MIDI learn glass (keeps mappings). */
  dismissMidiLearnGlass(): void {
    if (this.midiLearnDebounce) {
      clearTimeout(this.midiLearnDebounce);
      this.midiLearnDebounce = null;
    }
    this.midiLearnPending = null;
    if (this.midiLearnHideTimer) {
      clearTimeout(this.midiLearnHideTimer);
      this.midiLearnHideTimer = null;
    }
    this.midiLearnGlass = null;
    this.midiLearnBaseline = null;
    this.notify();
  }

  /** Save = dismiss; mappings already persist via the controller preset store. */
  saveMidiLearnGlass(): void {
    this.midiLearnBaseline = null;
    this.dismissMidiLearnGlass();
    this.setStatus('Controller mapping kept');
  }

  /** Cancel = restore the preset from when the glass opened, then close. */
  cancelMidiLearnGlass(): void {
    if (this.midiLearnBaseline) {
      this.controller = clonePreset(this.midiLearnBaseline);
      this.applyMyStudioRoutes();
      this.persistSetup();
      this.midiLearnBaseline = null;
    }
    this.dismissMidiLearnGlass();
    this.setStatus('Mapping change cancelled');
  }

  setMidiLearnPinned(pinned: boolean): void {
    if (!this.midiLearnGlass) return;
    this.midiLearnGlass = { ...this.midiLearnGlass, pinned };
    if (pinned) {
      if (this.midiLearnHideTimer) {
        clearTimeout(this.midiLearnHideTimer);
        this.midiLearnHideTimer = null;
      }
    } else {
      this.armMidiLearnHide();
    }
    this.notify();
  }

  /** Hide the glass for 10 seconds even if knobs keep moving. */
  snoozeMidiLearnGlass(ms = 10_000): void {
    this.midiLearnSnoozeUntil = Date.now() + ms;
    this.dismissMidiLearnGlass();
    this.setStatus('MIDI learn glass hidden for 10s');
  }

  /** “Twist another control to reassign” — next macro on this track swaps into the open slot. */
  startMidiLearnReassign(): void {
    if (!this.midiLearnGlass || this.midiLearnGlass.mapping.knob == null) return;
    const { track, knob } = this.midiLearnGlass.mapping;
    this.midiLearnGlass = { ...this.midiLearnGlass, learnReassign: true, pinned: true };
    this.controllerLearn = { kind: 'twist', track, knob };
    this.setStatus('Twist another Circuit macro to reassign');
    this.notify();
  }

  private armMidiLearnHide(): void {
    if (this.midiLearnHideTimer) clearTimeout(this.midiLearnHideTimer);
    if (this.midiLearnGlass?.pinned) return;
    this.midiLearnHideTimer = setTimeout(() => {
      if (this.midiLearnGlass && !this.midiLearnGlass.pinned) {
        this.midiLearnGlass = null;
        this.notify();
      }
    }, 6000);
  }

  private queueMidiLearnGlass(mapping: ResolvedControlMapping): void {
    if (Date.now() < this.midiLearnSnoozeUntil) return;

    const open = this.midiLearnGlass;
    const same = open && controlMappingKey(open.mapping) === controlMappingKey(mapping);

    if (same && open) {
      this.midiLearnGlass = {
        ...open,
        mapping: { ...mapping },
        at: Date.now(),
      };
      this.armMidiLearnHide();
      return;
    }

    // Pinned: refresh to the new control immediately (still editing).
    if (open?.pinned && !open.learnReassign) {
      this.midiLearnGlass = {
        mapping: { ...mapping },
        at: Date.now(),
        learnReassign: false,
        pinned: true,
      };
      this.notify();
      return;
    }

    this.midiLearnPending = mapping;
    if (this.midiLearnDebounce) clearTimeout(this.midiLearnDebounce);
    this.midiLearnDebounce = setTimeout(() => {
      this.midiLearnDebounce = null;
      const pending = this.midiLearnPending;
      this.midiLearnPending = null;
      if (!pending || Date.now() < this.midiLearnSnoozeUntil) return;
      this.midiLearnBaseline = clonePreset(this.controller);
      this.midiLearnGlass = {
        mapping: { ...pending },
        at: Date.now(),
        learnReassign: false,
        pinned: false,
      };
      this.armMidiLearnHide();
      this.notify();
    }, 140);
  }

  /** Slow sweep (min→max→min, ~2.4 s) to a mapped knob target, so you can hear or see it move. */
  testControllerKnob(track: number, knob: number): void {
    const tr = this.controller.tracks[track - 1];
    const slot = tr?.knobs[knob];
    if (!tr?.dest || !slot) return;
    const cc = slotCc(slot);
    if (cc == null) {
      this.setStatus(knobTarget(slot.target)?.kind === 'steps' ? 'Sound steps: turn the real knob to test' : 'This knob is not mapped');
      this.notify();
      return;
    }
    const p = portsForRoles(this.assignments);
    const port = tr.dest.device === 'sp' ? p.spOut : tr.dest.device === 'mpc' ? p.mpcOut : p.fm1Out;
    if (!port) {
      this.setStatus('That device is not connected');
      this.notify();
      return;
    }
    for (const t of this.testTimers) clearTimeout(t);
    this.testTimers = [];
    const ch = destChannel(tr.dest, this.controller);
    const steps = 24;
    const values = [
      ...Array.from({ length: steps + 1 }, (_, i) => i / steps),
      ...Array.from({ length: steps }, (_, i) => 1 - (i + 1) / steps),
    ].map((f) => Math.round(slot.min + f * (slot.max - slot.min)));
    values.forEach((v, i) => {
      this.testTimers.push(
        setTimeout(() => {
          const data = new Uint8Array([0xb0 | ((ch - 1) & 0x0f), cc, v]);
          this.transport.send(port, data);
          this.bus.emit({ type: 'midi:out', message: parseMidiMessage(data, performance.now(), port) });
        }, i * 50),
      );
    });
    this.setStatus(`Testing knob ${knob + 1} on T${track}: sweeping ${slot.min}→${slot.max}→${slot.min}`);
    this.notify();
  }

  private controllerIncoming(message: MidiMessage): void {
    // Never react to MIDI clock / transport / SysEx here — glass must not spam.
    if (isLearnGlassIgnoredMidi(message.kind)) return;

    const t = message.channel ?? 0;
    if (t < 1 || t > 8) return;
    const isNote = message.kind === 'note-on' && (message.velocity ?? 0) > 0;
    // MIDI-guided FLIP: observe note-ons during capture (no MIDI playback).
    if (isNote && message.note != null) {
      getFlipEngine().ingestMidiNoteOn({
        channel: t,
        note: message.note,
        velocity: message.velocity ?? 0,
      });
    }
    const knob =
      message.kind === 'cc' && message.controller != null
        ? CIRCUIT_MACRO_CCS.indexOf(message.controller as (typeof CIRCUIT_MACRO_CCS)[number])
        : -1;
    const resolved =
      message.kind === 'cc' ? resolveControlMapping(this.controller, message) : null;

    // Last-touched from macros even when the track has no Controller mapping yet.
    if (knob >= 0 && message.controller != null) {
      const touch = this.circuitIntel.onMacroCc(t, message.controller, message.value ?? 0);
      if (touch?.shouldAutoFocus) this.activeCircuitTrack = t;
      // Super Macros (opt-in fan-out) — additive to single-destination Controller Learn.
      this.superMacros.setActiveTrack(this.activeCircuitTrack ?? t);
      const bar = this.circuitIntel.getSnapshot().position.bar;
      this.superMacros.setMusicalBar(bar);
      const intents = this.superMacros.onMacroCc(t, knob, message.value ?? 0);
      if (intents.length) {
        this.ensureSuperMacroTimers();
        this.dispatchSuperMacroIntents(intents);
      }
      getPerformanceMemory().recordMacro({
        track: t,
        knob,
        cc: message.controller,
        value: message.value ?? 0,
      });
    }

    if (!isNote && !resolved && knob < 0) return;

    if (knob < 0) {
      // Notes / non-macro CCs still update the live track highlight.
      this.activeCircuitTrack = t;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const learn = this.controllerLearn;
    if (learn?.kind === 'first-note' && isNote && t === learn.track && message.note != null) {
      this.controllerLearn = null;
      this.setControllerTrack(t, { firstNote: message.note });
      this.setStatus(`Learned: Circuit note ${message.note} on T${t} is the first note`);
    } else if (learn?.kind === 'twist' && knob >= 0) {
      this.controllerLearn = null;
      if (this.midiLearnGlass) {
        this.midiLearnGlass = { ...this.midiLearnGlass, learnReassign: false };
      }
      if (knob !== learn.knob) {
        this.changeController(swapKnobs(this.controller, learn.track, learn.knob, knob), `Moved to knob ${knob + 1}`);
        const after = resolveControlMapping(this.controller, {
          kind: 'cc',
          channel: learn.track,
          controller: CIRCUIT_MACRO_CCS[knob],
          value: message.value,
        });
        if (after) {
          this.midiLearnGlass = {
            mapping: after,
            at: Date.now(),
            learnReassign: false,
            pinned: this.midiLearnGlass?.pinned ?? true,
          };
        }
      } else {
        this.setStatus(`That's already knob ${knob + 1}`);
      }
    }

    if (knob >= 0) {
      this.knobValues[t - 1]![knob] = message.value ?? 0;
      this.lastKnob = { track: t, knob, at: now };
    }
    const ev = describeIncoming(this.controller, message);
    if (ev) {
      const head = this.ctrlEvents[0];
      // A knob being turned replaces its own last line instead of flooding the list.
      if (knob >= 0 && head && head.text.startsWith(`T${t} knob ${knob + 1} `)) {
        this.ctrlEvents[0] = { text: ev.text, device: ev.device, at: Date.now() };
      } else {
        this.ctrlEvents = [{ text: ev.text, device: ev.device, at: Date.now() }, ...this.ctrlEvents].slice(0, 10);
      }
    }

    // Glass: macros + mixer only (not notes — pads would spam while playing).
    if (resolved) this.queueMidiLearnGlass(resolved);

    if (knob >= 0 && now - this.ctrlNotifyAt < 33) return;
    this.ctrlNotifyAt = now;
    this.notify();
  }

  applyMyStudioRoutes(): void {
    const p = portsForRoles(this.assignments);
    if (!p.circuitIn) {
      // Keep previous routes; greyed devices still listed
      this.routing.setClockAuthority(null);
      this.notify();
      return;
    }
    const routes = buildMyStudioRoutes({
      circuitIn: p.circuitIn,
      mpcOut: p.mpcOut || '__missing_mpc__',
      spOut: p.spOut || '__missing_sp__',
      fm1Out: p.fm1Out || '__missing_fm1__',
      clockToMpc: this.clockToMpc,
      clockToSp: this.clockToSp,
      fm1Firmware: this.fm1Firmware,
      mpcNoteMode: this.mpcNoteMode,
      forwardClockToFm1: this.forwardClockToFm1,
      // Notes and knobs now come from the Circuit Controller; the layout adds clock only.
      trackPlan: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] },
      spNoteOffset: this.spNoteOffset,
    })
      .concat(
        buildControllerRoutes(
          this.controller,
          {
            circuitIn: p.circuitIn,
            mpcOut: p.mpcOut || '__missing_mpc__',
            spOut: p.spOut || '__missing_sp__',
            fm1Out: p.fm1Out || '__missing_fm1__',
          },
          { fm1Firmware: this.fm1Firmware, mpcNoteMode: this.mpcNoteMode },
        ),
      )
      .map((r) => ({
      ...r,
      destinations: r.destinations.filter((d) => !d.portId.startsWith('__missing_')),
    }));

    this.routing.setRoutes(routes.filter((r) => r.destinations.length > 0));
    this.routing.setClockAuthority(
      this.anyClockForwarding() ? p.circuitIn : null,
    );
    this.arranger.configure({
      kind: 'circuit-rhythm',
      deviceId: 'device:circuit-rhythm',
      label: 'My Studio — Circuit arranger (direct sequencing)',
    });
  }

  saveScene(name: string): StudioScene {
    const focus = this.focus.getState();
    const scene: StudioScene = {
      id: `scene-${Date.now()}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      routes: this.routing.getRoutes(),
      clockAuthorityPortId: this.routing.getClockAuthority(),
      roles: this.roles.getBindings(),
      focusMode: focus.mode,
      pinnedDeviceId: focus.pinnedDeviceId,
      activeDeviceId: focus.activeDeviceId,
      arranger: this.arranger.getConfig(),
    };
    const ports = new Set(this.transport.listPorts().map((p) => p.id));
    const devices = new Set(this.registry.list().map((d) => d.id));
    const issues = validateScene(scene, ports, devices);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
    this.scenes.save(scene);
    this.setStatus(`Scene saved: ${name}`);
    this.notify();
    return scene;
  }

  recallScene(id: string): void {
    const scene = this.scenes.recall(id);
    if (!scene) {
      this.setStatus(`Scene not found: ${id}`);
      return;
    }
    // Rebind scene routes onto current assignments when possible
    this.routing.setRoutes(scene.routes);
    this.applyMyStudioRoutes();
    this.roles.setBindings(scene.roles);
    this.focus.setMode(scene.focusMode);
    if (scene.pinnedDeviceId) this.focus.pin(scene.pinnedDeviceId);
    else if (scene.activeDeviceId) this.focus.select(scene.activeDeviceId);
    this.arranger.configure(scene.arranger);
    this.bus.emit({ type: 'scene:recalled', sceneId: id });
    this.setStatus(`Scene recalled: ${scene.name}`);
    this.notify();
  }

  exportSession(): string {
    const snap = this.getSnapshot();
    const session: DawlessdawSession = {
      ...this.session,
      scenes: snap.scenes,
      activeSceneId: snap.activeSceneId,
      routingPresets: [
        {
          id: 'my-studio',
          name: 'My Studio',
          routes: snap.routes,
          clockAuthorityPortId: snap.clockAuthorityPortId,
        },
      ],
      roles: snap.roles,
      arranger: snap.arranger,
      focusMode: snap.focus.mode,
      pinnedDeviceId: snap.focus.pinnedDeviceId,
      simulation: false,
      updatedAt: Date.now(),
      controller: { working: this.controller, presets: this.controllerPresets, savedId: this.controllerSavedId },
    };
    this.session = session;
    return exportSessionJson(session);
  }

  importSession(raw: string): void {
    const result = importSessionJson(raw);
    if (!result.ok || !result.session) throw new Error(result.errors.join('; '));
    this.session = result.session;
    for (const scene of result.session.scenes) this.scenes.save(scene);
    if (result.session.routingPresets[0]) {
      this.routing.applyPreset(result.session.routingPresets[0]);
    }
    this.roles.setBindings(result.session.roles);
    const ctrl = result.session.controller as
      | { working?: unknown; presets?: unknown; savedId?: unknown }
      | undefined;
    if (ctrl) {
      const working = sanitizePreset(ctrl.working);
      if (working) {
        this.pushControllerHistory();
        this.controller = working;
      }
      if (Array.isArray(ctrl.presets)) {
        this.controllerPresets = ctrl.presets
          .map((x) => sanitizePreset(x))
          .filter((x): x is ControllerPreset => x !== null)
          .slice(0, 50);
      }
      if (typeof ctrl.savedId === 'string') this.controllerSavedId = ctrl.savedId;
      this.applyMyStudioRoutes();
      this.persistSetup();
    }
    this.arranger.configure(result.session.arranger);
    this.focus.setMode(result.session.focusMode);
    if (result.session.pinnedDeviceId) this.focus.pin(result.session.pinnedDeviceId);
    this.bus.emit({ type: 'session:loaded', sessionId: result.session.id });
    this.setStatus(`Session loaded: ${result.session.name}`);
    this.notify();
  }

  // —— Section Bridge ——

  resetCircuitLiveTicks(): void {
    this.circuitLiveTicks = emptyCircuitLiveTicks();
    this.notify();
  }

  setCircuitProjectSlot(index: number, patch: Partial<Pick<CircuitProjectSlot, 'name' | 'colour'>>): void {
    const i = Math.max(1, Math.min(64, Math.round(index)));
    const slot = this.circuitProjects[i - 1];
    if (!slot) return;
    if (typeof patch.name === 'string') slot.name = patch.name.trim().slice(0, 40) || `Project ${i}`;
    if (typeof patch.colour === 'string' && patch.colour.trim()) {
      slot.colour = patch.colour.trim().slice(0, 32);
    }
    saveCircuitProjects(this.circuitProjects);
    this.notify();
  }

  setControllerKnobPickup(on: boolean): void {
    this.controllerKnobPickup = on;
    try {
      localStorage.setItem(CONTROLLER_KNOB_PICKUP_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.superMacros.setControllerPickup(on);
    this.setStatus(
      on
        ? 'Knob soft takeover on — Super Macro destinations wait for pickup (experimental)'
        : 'Knob soft takeover off (default)',
    );
    this.notify();
  }

  reorderSectionBridgeRows(from: number, to: number): void {
    const rows = [...this.sectionBridge.rows];
    if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to) return;
    const [row] = rows.splice(from, 1);
    if (!row) return;
    rows.splice(to, 0, row);
    this.setSectionBridge({ ...this.sectionBridge, rows });
  }

  setSectionBridge(config: SectionBridgeConfig): void {
    this.sectionBridge = {
      eventActionsEnabled: config.eventActionsEnabled === true,
      enabled: config.enabled,
      rows: config.rows.map((r) => ({ ...r })),
    };
    getPerformanceMemory().setPrefs({
      sectionEventActionsEnabled: this.sectionBridge.eventActionsEnabled === true,
    });
    this.persistSetup();
    this.notify();
  }

  /**
   * Optional Performance Memory → Section Bridge replay for a confirmed project-change
   * event. No-ops when event-actions are off or the event is inferred.
   */
  runPerformanceSectionEventAction(ev: {
    kind: string;
    inferred: boolean;
    data: Record<string, unknown>;
  }): boolean {
    getPerformanceMemory().setPrefs({
      sectionEventActionsEnabled: this.sectionBridge.eventActionsEnabled === true,
    });
    const asTimeline = {
      id: 'replay',
      kind: ev.kind as PerformanceTimelineEvent['kind'],
      atMs: 0,
      relativeMs: 0,
      sample: 0,
      seconds: 0,
      summary: '',
      confidence: 'high' as const,
      inferred: ev.inferred,
      honesty: 'experimental' as const,
      data: ev.data,
      markerId: null,
    };
    if (!getPerformanceMemory().mayRunSectionEventAction(asTimeline)) {
      this.setStatus(
        'Section event-actions off or event is inferred — nothing sent (no auto fills from guesses)',
      );
      return false;
    }
    const index = typeof ev.data.index === 'number' ? ev.data.index : null;
    const program =
      typeof ev.data.program === 'number'
        ? ev.data.program
        : index != null
          ? index - 1
          : null;
    if (program == null || program < 0) {
      this.setStatus('No project index on that timeline event');
      return false;
    }
    this.runSectionBridge(program);
    return true;
  }

  updateSectionBridgeRow(index: number, patch: Partial<SectionBridgeConfig['rows'][0]>): void {
    const rows = this.sectionBridge.rows.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    this.sectionBridge = { ...this.sectionBridge, rows };
    this.persistSetup();
    this.notify();
  }

  panic(): void {
    const outs = [
      portsForRoles(this.assignments).mpcOut,
      portsForRoles(this.assignments).spOut,
      portsForRoles(this.assignments).fm1Out,
    ].filter(Boolean) as string[];
    for (const portId of outs) {
      for (const msg of buildPanicMessages()) {
        this.transport.send(portId, new Uint8Array(msg.data));
      }
    }
    this.routing.allNotesOff();
    this.setStatus('Panic — All Notes Off / All Sound Off sent (no SysEx)');
    this.notify();
  }

  // —— Bench ——

  setActiveBench(id: string | null): void {
    this.activeBenchId = id;
    this.benchDetections = [];
    this.notify();
  }

  markBench(id: string, verdict: BenchVerdict, note = ''): void {
    this.benchResults = this.benchResults.map((r) =>
      r.id === id
        ? {
            ...r,
            verdict,
            note,
            detections: [...this.benchDetections],
            updatedAt: Date.now(),
          }
        : r,
    );
    this.notify();
  }

  startSceneMidiCapture(): void {
    this.capturingSceneMidi = true;
    this.benchDetections = ['capture started — change Circuit Scene now'];
    this.activeBenchId = 'circuit-scene-any-midi';
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => {
      this.capturingSceneMidi = false;
      this.pushBenchDetection(
        'circuit-scene-any-midi',
        `capture ended — ${this.benchDetections.length} lines`,
      );
      this.notify();
    }, 10_000);
    this.notify();
  }

  sendBenchSpProgramChange(program = 0): void {
    const spOut = portsForRoles(this.assignments).spOut;
    if (!spOut) {
      this.setStatus('SP output port not assigned');
      return;
    }
    const status = 0xc0 | ((SP_PATTERN_PC_CHANNEL - 1) & 0x0f);
    this.transport.send(spOut, new Uint8Array([status, program & 0x7f]));
    this.pushBenchDetection(
      'sp-pattern-pc',
      `sent PC ${program} ch${SP_PATTERN_PC_CHANNEL} → SP`,
    );
    this.setStatus(
      `Sent Program Change ${program} on ch${SP_PATTERN_PC_CHANNEL} to SP-404 (verify on hardware)`,
    );
  }

  sendBenchMpcProgramChange(program = 0): void {
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    if (!mpcOut) {
      this.setStatus('MPC output port not assigned');
      return;
    }
    const status = 0xc0 | ((MPC_CONTROL_CHANNEL - 1) & 0x0f);
    this.transport.send(mpcOut, new Uint8Array([status, program & 0x7f]));
    this.pushBenchDetection(
      'mpc-sequence-pc',
      `sent PC ${program} ch${MPC_CONTROL_CHANNEL} → MPC`,
    );
    this.setStatus(
      `Sent Program Change ${program} on control ch${MPC_CONTROL_CHANNEL} to MPC (verify on hardware)`,
    );
  }

  sendBenchMpcMuteCc(): void {
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    if (!mpcOut) {
      this.setStatus('MPC output port not assigned');
      return;
    }
    const ch = MPC_MUTE_LEARN_CHANNEL;
    const data = new Uint8Array([
      0xb0 | ((ch - 1) & 0x0f),
      MPC_MUTE_LEARN_CC,
      127,
    ]);
    this.transport.send(mpcOut, data);
    this.pushBenchDetection(
      'mpc-mute-cc',
      `sent CC ${MPC_MUTE_LEARN_CC} ch${ch}=127 → MPC (MIDI Learn target)`,
    );
    this.setStatus(
      `Mute test CC ${MPC_MUTE_LEARN_CC} ch${ch} — learn this on MPC Mixer→Mute`,
    );
  }

  /**
   * Direct Start + a few Timing Clocks to MPC USB out (bypasses Circuit).
   * Proves the Mac→MPC Web MIDI out path; if OUT monitor rises but MPC stays
   * silent, Akai USB-B typically does not accept MIDI Clock (use DIN thru).
   */
  sendBenchMpcClockBurst(): void {
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    if (!mpcOut) {
      this.setStatus('MPC output port not assigned');
      return;
    }
    this.activeBenchId = 'mpc-scarlett-clock';
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const msgs: Uint8Array[] = [
      new Uint8Array([0xfa]),
      ...Array.from({ length: 24 }, () => new Uint8Array([0xf8])),
      new Uint8Array([0xfc]),
    ];
    for (const data of msgs) {
      this.transport.send(mpcOut, data);
      const message = parseMidiMessage(
        data,
        typeof performance !== 'undefined' ? performance.now() : Date.now(),
        mpcOut,
      );
      this.bus.emit({ type: 'midi:out', message });
    }
    void now;
    this.pushBenchDetection(
      'mpc-scarlett-clock',
      'sent test FA + 24×F8 + FC → MPC Out (direct, not via Circuit)',
    );
    this.setStatus(
      'Sent test Start / 24 clocks / Stop → MPC Out. The MPC should start and stop once.',
    );
    this.notify();
  }

  exportBenchJson(): string {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = buildBenchExport(this.benchResults, this.rawMidiLog.slice(-2000));
    void stamp;
    return JSON.stringify(payload, null, 2);
  }

  downloadBenchJson(): void {
    if (typeof document === 'undefined') return;
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([this.exportBenchJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dawlessdaw-bench-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // —— internals ——

  private syncLivePorts(ports: ReturnType<HardwareTransport['listPorts']>): void {
    // Empty / dash / mock previous slots must not block Felucca → FM1 (and peers).
    this.assignments = matchPortsToRoles(ports, this.assignments);
    // Role claims win so Felucca bound to FM1 is m-vave-fm1, not generic-midi.
    this.registry.syncFromPorts(ports, this.assignments);
    this.registry.ensureZed();
    this.refreshCustomBindings(ports);
    this.remapFocusPorts();
    this.persistSetup();
  }

  private persistSetup(): void {
    saveSetup({
      version: 2,
      assignments: this.assignments,
      clockToMpc: this.clockToMpc,
      clockToSp: this.clockToSp,
      lastRoutingPresetId: 'my-studio',
      fm1Firmware: this.fm1Firmware,
      mpcNoteMode: this.mpcNoteMode,
      forwardClockToFm1: this.forwardClockToFm1,
      circuitT1to4Target: this.circuitT1to4Target,
      spNoteOffset: this.spNoteOffset,
      ...(this.trackPlan ? { trackPlan: this.trackPlan } : {}),
      sectionBridge: this.sectionBridge,
      controller: this.controller,
      controllerPresets: this.controllerPresets,
      controllerSavedId: this.controllerSavedId,
    });
  }

  private handleIncoming(message: MidiMessage, deviceId?: string): void {
    const circuitIn = portsForRoles(this.assignments).circuitIn;
    const fromCircuit = circuitIn && message.portId === circuitIn;

    if (
      this.genericLearn &&
      message.kind === 'cc' &&
      message.controller !== undefined &&
      !isLearnGlassIgnoredMidi(message.kind)
    ) {
      const binding = this.customBindings[this.genericLearn.profileId];
      const onDevice =
        binding?.inputPortId != null
          ? message.portId === binding.inputPortId
          : true; // no in-port yet: accept from any port
      if (onDevice) {
        const profile = this.customProfiles.find((p) => p.id === this.genericLearn!.profileId);
        if (profile) {
          const learned = applyLearnToControl(
            profile,
            this.genericLearn.controlId,
            message.controller,
            message.channel,
          );
          this.genericLearn = null;
          if (learned.ok && learned.profile) {
            this.upsertCustomProfile(learned.profile, { silent: true });
            this.setStatus(
              `Learned CC ${message.controller}${message.channel != null ? ` ch${message.channel}` : ''} on “${profile.displayName}”`,
            );
            this.notify();
            return;
          }
        }
      }
    }

    if (
      this.learningSpPadOffset &&
      fromCircuit &&
      message.kind === 'note-on' &&
      message.channel !== undefined &&
      message.channel >= 1 &&
      message.channel <= 4 &&
      message.note !== undefined
    ) {
      this.setSpNoteOffset(SP_MODE_A_PAD1_NOTE - message.note);
      this.setStatus(
        `Learned: Circuit note ${message.note} → SP pad 1 (offset ${this.spNoteOffset >= 0 ? '+' : ''}${this.spNoteOffset})`,
      );
    }

    if (fromCircuit) this.controllerIncoming(message);

    if (fromCircuit || this.registry.get(deviceId ?? '')?.kind === 'circuit-rhythm') {
      const interpreted = this.circuitInterpreter.interpret(message);
      this.lastCircuitGesture = interpreted;

      // Phase 2 live ticks — Circuit USB in only (checklist lights).
      if (fromCircuit) {
        const at = Date.now();
        if (message.kind === 'note-on' && (message.velocity ?? 0) > 0) {
          this.circuitLiveTicks = bumpCircuitTick(this.circuitLiveTicks, 'note', at);
        } else if (message.kind === 'cc') {
          this.circuitLiveTicks = bumpCircuitTick(this.circuitLiveTicks, 'cc', at);
        } else if (message.kind === 'program-change') {
          this.circuitLiveTicks = bumpCircuitTick(this.circuitLiveTicks, 'pc', at);
        }
      }

      if (interpreted.gesture === 'arrangement' && interpreted.projectIndex != null) {
        this.pushBenchDetection(
          'circuit-project-pgm',
          `Project ${interpreted.projectIndex} (${interpreted.projectChangeKind})`,
        );
        // Intelligence: Project Change is informational (never outbound from intel).
        if (fromCircuit) this.circuitIntel.onProjectChange(message.value ?? 0);
        this.runSectionBridge(message.value ?? 0);
        this.notify();
        return;
      }

      if (message.kind === 'note-on' && (message.velocity ?? 0) > 0 && message.channel) {
        if (message.channel >= 1 && message.channel <= 8) {
          this.trackActivity[message.channel] =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (message.note !== undefined) {
            // Live MIDI Activity monitor / optional record — not Circuit pattern dump.
            this.sequencer.observeCircuitNote(
              message.channel,
              message.note,
              message.velocity ?? 0,
            );
            // Circuit Mirror Live: Circuit **input** only (fromCircuit gate above).
            if (fromCircuit) {
              this.circuitMirror.onNoteOn(
                message.channel,
                message.note,
                message.velocity ?? 0,
              );
              // Activity fingerprints — after routing path; analysis only.
              this.circuitIntel.onNoteOn(
                message.channel,
                message.note,
                message.velocity ?? 0,
              );
            }
          }
        }
        this.pushBenchDetection(
          'circuit-notes-1-8',
          `note ch${message.channel} n${message.note}`,
        );
        if (this.pendingNoteIns.size > 256) this.pendingNoteIns.clear();
        this.pendingNoteIns.set(
          `${message.channel}:${message.note}`,
          typeof performance !== 'undefined' ? performance.now() : Date.now(),
        );
      }

      if (interpreted.gesture === 'sequencer-stream' || interpreted.gesture === 'background') {
        // Clock/background: do not notify() every tick — Patchbay clock strip is throttled.
        return;
      }
      if (interpreted.focusWorthy) this.focus.onMidi(message, deviceId);
      this.notify();
      return;
    }

    this.focus.onMidi(message, deviceId);
  }

  /** Pull new Circuit Intelligence events into Performance Memory while a take is recording. */
  private ingestPerformanceMemoryFromIntel(): void {
    const mem = getPerformanceMemory();
    if (!mem.isActive()) return;
    mem.ingestMusicalEvents(this.circuitIntel.getSnapshot().events);
  }

  private runSectionBridge(program: number): void {
    const action = resolveSectionBridge(program, this.sectionBridge);
    this.lastProject = {
      index: (program % 64) + 1,
      kind: program >= 64 ? 'queued' : 'instant',
      matched: Boolean(action),
      at: Date.now(),
    };
    if (!action) {
      this.setStatus(`Circuit Project PGM ${program} — no Section Bridge row`);
      return;
    }
    const p = portsForRoles(this.assignments);
    for (const out of action.outbound) {
      const portId = out.portRole === 'sp404' ? p.spOut : p.mpcOut;
      if (!portId) continue;
      // Skip if bench not passed — still allow send but warn
      const cap =
        out.portRole === 'sp404'
          ? this.benchResults.find((b) => b.id === 'sp-pattern-pc')
          : this.benchResults.find((b) => b.id === 'mpc-sequence-pc');
      this.transport.send(portId, new Uint8Array(out.data));
      if (cap && cap.verdict !== 'pass') {
        this.bus.emit({
          type: 'studio:status',
          message: `${out.portRole} PC sent — capability still hardware-testing-required`,
          level: 'warn',
        });
      }
    }
    if (action.sceneId) this.recallScene(action.sceneId);
    this.setStatus(
      `Section Bridge: Project ${action.projectIndex} (${action.kind}) → SP/MPC/Scene`,
    );
  }

  private resetClockActivity(): void {
    this.clockInTicks = 0;
    this.clockOutTicks = 0;
    this.clockInByKind = { clock: 0, start: 0, stop: 0, continue: 0 };
    this.clockOutByKind = { clock: 0, start: 0, stop: 0, continue: 0 };
    this.lastClockInKind = null;
    this.lastClockInAt = null;
    this.lastClockOutKind = null;
    this.lastClockOutAt = null;
    this.clockUiNotifyAt = 0;
    this.clockLogSample = 0;
  }

  private bumpKind(
    bag: { clock: number; start: number; stop: number; continue: number },
    kind: string,
  ): void {
    if (kind === 'clock' || kind === 'start' || kind === 'stop' || kind === 'continue') {
      bag[kind] += 1;
    }
  }

  private clockHint(): string {
    const p = portsForRoles(this.assignments);
    const mpcName = this.assignments.find((a) => a.roleId === 'mpc')?.outputPortName ?? null;
    const missingOuts = [
      this.clockToMpc && !p.mpcOut ? 'MPC' : null,
      this.clockToSp && !p.spOut ? 'SP' : null,
      this.forwardClockToFm1 && !p.fm1Out ? 'FM1' : null,
    ].filter((x): x is string => Boolean(x));
    const mpcAdvice = this.clockToMpc ? mpcClockPortAdvice(mpcName) : null;
    return plainClockHint({
      forwarding: this.anyClockForwarding(),
      circuitIn: Boolean(p.circuitIn),
      missingOuts,
      mpcUsbClockRisk: mpcAdvice?.kind === 'warn-akai-usb',
      heardClock: this.clockInTicks > 0,
      forwardedClock: this.clockOutTicks > 0,
    });
  }

  private computeOnboarding(): { step: OnboardingStep; message: string } {
    const connected = this.transport.listPorts().filter((p) => p.state === 'connected');
    const circuit = this.assignments.find((a) => a.roleId === 'circuit');
    const rolePorts = new Set<string>();
    for (const a of this.assignments) {
      if (a.inputPortId) rolePorts.add(a.inputPortId);
      if (a.outputPortId) rolePorts.add(a.outputPortId);
    }
    for (const b of Object.values(this.customBindings)) {
      if (b.inputPortId) rolePorts.add(b.inputPortId);
      if (b.outputPortId) rolePorts.add(b.outputPortId);
    }
    const unmatched = connected.filter((p) => !rolePorts.has(p.id));
    const hasAmbiguousCustom = Object.values(this.customBindings).some((b) => b.ambiguous);
    return nextOnboardingStep({
      midiReady: this.midiReady,
      midiError: this.midiError,
      connectedPortCount: connected.length,
      circuitAssigned: Boolean(circuit?.inputPortId),
      hasUnmatchedPorts: unmatched.length > 0,
      hasAmbiguousCustom,
    });
  }

  private refreshCustomBindings(ports: ReturnType<HardwareTransport['listPorts']>): void {
    const claimed = new Set<string>();
    for (const a of this.assignments) {
      if (a.inputPortId) claimed.add(a.inputPortId);
      if (a.outputPortId) claimed.add(a.outputPortId);
    }
    const next: StudioRuntimeSnapshot['customBindings'] = {};
    for (const profile of this.customProfiles) {
      const bound = restoreCustomProfilePorts(profile, ports, claimed);
      if (bound.inputPortId) claimed.add(bound.inputPortId);
      if (bound.outputPortId) claimed.add(bound.outputPortId);
      next[profile.id] = bound;
    }
    this.customBindings = next;
  }

  private persistCustomProfiles(): void {
    saveCustomProfiles(this.customProfiles);
  }

  /** Add or replace a custom / unknown-device profile and remember its ports. */
  upsertCustomProfile(profile: GenericDeviceProfile, opts?: { silent?: boolean }): void {
    const idx = this.customProfiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) this.customProfiles[idx] = profile;
    else this.customProfiles = [...this.customProfiles, profile];
    this.persistCustomProfiles();
    this.refreshCustomBindings(this.transport.listPorts());
    if (!opts?.silent) this.setStatus(`Saved device “${profile.displayName}” (${profile.honesty})`);
    this.notify();
  }

  createCustomDevice(input: {
    displayName: string;
    manufacturer?: string;
    category?: DeviceCategory;
    colour?: string;
    channel?: number;
    inputPortId?: string | null;
    outputPortId?: string | null;
    honesty?: ProfileHonesty;
    notes?: string;
  }): void {
    const ports = this.transport.listPorts();
    const inPort = ports.find((p) => p.id === input.inputPortId);
    const outPort = ports.find((p) => p.id === input.outputPortId);
    const result = createGenericProfile({
      displayName: input.displayName,
      manufacturer: input.manufacturer,
      category: input.category,
      colour: input.colour,
      channel: input.channel,
      inputPortName: inPort?.name ?? null,
      outputPortName: outPort?.name ?? null,
      portNameHints: [input.displayName, inPort?.name ?? '', outPort?.name ?? ''].filter(Boolean),
      honesty: input.honesty ?? 'generic',
      notes: input.notes,
    });
    if (!result.ok || !result.profile) {
      this.setStatus(`Could not save device: ${result.errors.join('; ')}`);
      this.notify();
      return;
    }
    this.upsertCustomProfile(result.profile);
  }

  deleteCustomProfile(id: string): void {
    const name = this.customProfiles.find((p) => p.id === id)?.displayName ?? id;
    this.customProfiles = this.customProfiles.filter((p) => p.id !== id);
    delete this.customBindings[id];
    if (this.genericLearn?.profileId === id) this.genericLearn = null;
    this.persistCustomProfiles();
    this.setStatus(`Removed device “${name}”`);
    this.notify();
  }

  assignCustomProfilePort(
    profileId: string,
    which: 'input' | 'output',
    portId: string | null,
  ): void {
    const profile = this.customProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    const port = this.transport.listPorts().find((p) => p.id === portId);
    const next: GenericDeviceProfile = {
      ...profile,
      inputPortName: which === 'input' ? (port?.name ?? null) : profile.inputPortName,
      outputPortName: which === 'output' ? (port?.name ?? null) : profile.outputPortName,
      updatedAt: Date.now(),
    };
    this.upsertCustomProfile(next);
  }

  addCustomControl(profileId: string, label: string): void {
    const profile = this.customProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    const result = addControl(profile, label);
    if (!result.ok || !result.profile) {
      this.setStatus(result.errors.join('; '));
      this.notify();
      return;
    }
    this.upsertCustomProfile(result.profile);
  }

  removeCustomControl(profileId: string, controlId: string): void {
    const profile = this.customProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    const result = removeControl(profile, controlId);
    if (!result.ok || !result.profile) return;
    if (this.genericLearn?.profileId === profileId && this.genericLearn.controlId === controlId) {
      this.genericLearn = null;
    }
    this.upsertCustomProfile(result.profile);
  }

  /** Wait for the next CC on this custom device's input → store on the control. */
  startGenericLearn(profileId: string, controlId: string): void {
    const profile = this.customProfiles.find((p) => p.id === profileId);
    if (!profile?.controls.some((c) => c.id === controlId)) return;
    this.genericLearn = { profileId, controlId };
    this.setStatus('Listening — twist a knob on that device (MIDI Learn)');
    this.notify();
  }

  cancelGenericLearn(): void {
    if (!this.genericLearn) return;
    this.genericLearn = null;
    this.setStatus('MIDI Learn cancelled');
    this.notify();
  }

  exportCustomProfilesJson(): string {
    return exportProfileBundleJson(this.customProfiles);
  }

  importCustomProfilesJson(raw: string): void {
    const result = importProfileBundleJson(raw);
    if (!result.ok || !result.bundle) {
      this.setStatus(`Import failed: ${result.errors.join('; ')}`);
      this.notify();
      return;
    }
    const byId = new Map(this.customProfiles.map((p) => [p.id, p]));
    for (const p of result.bundle.profiles) byId.set(p.id, p);
    this.customProfiles = [...byId.values()];
    this.persistCustomProfiles();
    this.refreshCustomBindings(this.transport.listPorts());
    this.setStatus(`Imported ${result.bundle.profiles.length} device profile(s)`);
    this.notify();
  }

  private recordClockActivity(message: MidiMessage): void {
    const now = Date.now();
    const circuitIn = portsForRoles(this.assignments).circuitIn;
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    const spOut = portsForRoles(this.assignments).spOut;
    const fm1Out = portsForRoles(this.assignments).fm1Out;
    const isIn = circuitIn != null && message.portId === circuitIn;
    if (isIn && (message.kind === 'clock' || message.kind === 'start' || message.kind === 'continue')) {
      // Throttle clock tick UI bumps — F8 is 24 PPQN; count every tick but notify sparsely via clock path.
      this.circuitLiveTicks = bumpCircuitTick(this.circuitLiveTicks, 'clock', now);
    }
    const isOut =
      (mpcOut != null && message.portId === mpcOut) ||
      (spOut != null && message.portId === spOut) ||
      (fm1Out != null && message.portId === fm1Out);
    const transport =
      message.kind === 'start' ||
      message.kind === 'stop' ||
      message.kind === 'continue';

    if (isIn) {
      this.clockInTicks += 1;
      this.bumpKind(this.clockInByKind, message.kind);
      this.lastClockInKind = message.kind;
      this.lastClockInAt = now;
      if (message.kind === 'clock') {
        const t = typeof performance !== 'undefined' ? performance.now() : now;
        this.clockTickTimes = [...this.clockTickTimes.slice(-47), t];
        if (this.clockTickTimes.length >= 24) {
          const first = this.clockTickTimes[0]!;
          const last = this.clockTickTimes[this.clockTickTimes.length - 1]!;
          const ticks = this.clockTickTimes.length - 1;
          const msPerTick = (last - first) / ticks;
          // 24 MIDI clocks per quarter note
          const bpm = 60_000 / (msPerTick * 24);
          if (Number.isFinite(bpm) && bpm > 20 && bpm < 400) {
            this.estimatedBpm = Math.round(bpm * 10) / 10;
          }
        }
      }
      if (message.kind === 'stop') {
        this.clockTickTimes = [];
      }
      if (this.activeBenchId === 'usb-app-clock' && transport) {
        const hex =
          message.kind === 'start' ? 'FA' : message.kind === 'stop' ? 'FC' : 'FB';
        this.pushBenchDetection(
          'usb-app-clock',
          `IN ${message.kind} 0x${hex} (tick #${this.clockInTicks})`,
        );
      }
    }
    if (isOut && mpcOut != null && message.portId === mpcOut && transport) {
      this.pushBenchDetection('mpc-scarlett-clock', `OUT ${message.kind} → MPC output`);
    }
    if (isIn && transport && this.clockToMpc) {
      this.pushBenchDetection('mpc-scarlett-clock', `IN ${message.kind} from Circuit`);
    }
    if (isOut) {
      this.clockOutTicks += 1;
      this.bumpKind(this.clockOutByKind, message.kind);
      this.lastClockOutKind = message.kind;
      this.lastClockOutAt = now;
      if (this.activeBenchId === 'usb-app-clock' && transport) {
        const hex =
          message.kind === 'start' ? 'FA' : message.kind === 'stop' ? 'FC' : 'FB';
        this.pushBenchDetection(
          'usb-app-clock',
          `OUT ${message.kind} 0x${hex} → ${message.portId.slice(0, 16)}`,
        );
      }
    }

    // Always refresh UI on Start/Stop/Continue; throttle F8 (~5 Hz)
    if (transport || now - this.clockUiNotifyAt >= 200) {
      this.clockUiNotifyAt = now;
      this.notify();
    }
  }

  private logMidi(message: MidiMessage): void {
    const summary = `${message.kind} ch${message.channel ?? '-'} ${Array.from(message.data).join(',')}`;
    // Keep start/stop/continue always; sample F8 (~1/quarter) so exports stay readable
    let keep = true;
    if (message.kind === 'clock') {
      this.clockLogSample += 1;
      keep = this.capturingSceneMidi || this.clockLogSample % 24 === 1;
    }
    if (keep) {
      this.rawMidiLog = [
        ...this.rawMidiLog.slice(-1999),
        {
          at: Date.now(),
          portId: message.portId,
          data: Array.from(message.data),
          summary,
        },
      ];
    }
    if (this.capturingSceneMidi || this.activeBenchId === 'circuit-scene-any-midi') {
      this.benchDetections = [`${summary}`, ...this.benchDetections].slice(0, 80);
    }
    if (this.activeBenchId === 'usb-app-clock' && isClockLike(message.kind)) {
      if (message.kind !== 'clock' || this.clockLogSample % 24 === 1) {
        const hex = Array.from(message.data)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        this.benchDetections = [
          `${message.kind} [${hex}] @ ${message.portId}`,
          ...this.benchDetections,
        ].slice(0, 80);
      }
    }

    // Latency: when we see matching note leave via route-fired isn't easy; approximate
    // by measuring time between circuit note-in and any subsequent midi:out on mpc
    if (message.portId === portsForRoles(this.assignments).mpcOut) {
      // outbound logged separately
    }
  }

  /**
   * Timing Circuit → app → MPC output. Called for every note-on the app sends.
   * Only notes sent to the MPC's output port count, and the MPC's channel (9–12)
   * is mapped back to the Circuit track channel (1–4) to find the matching note-in.
   * This measures the Mac side only (USB in → Web MIDI send); the Scarlett's
   * USB → DIN hop and the MPC itself are not included.
   */
  recordOutboundLatency(note: number, channel: number, portId: string): void {
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    if (!mpcOut || portId !== mpcOut) return;
    const sourceChannel = MPC_CHANNEL_TO_CIRCUIT[channel];
    if (sourceChannel === undefined) return;
    const key = `${sourceChannel}:${note}`;
    const t0 = this.pendingNoteIns.get(key);
    if (t0 === undefined) return;
    this.pendingNoteIns.delete(key);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = now - t0;
    this.latencySamples = [...this.latencySamples.slice(-63), dt];
    const mean =
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    const variance =
      this.latencySamples.reduce((a, b) => a + (b - mean) ** 2, 0) /
      this.latencySamples.length;
    const jitter = Math.sqrt(variance);
    const v = latencyVerdict(mean, jitter);
    this.latencyStats = {
      samples: this.latencySamples.length,
      meanMs: Math.round(mean * 10) / 10,
      jitterMs: Math.round(jitter * 10) / 10,
      message: v.message,
    };
    this.pushBenchDetection(
      'timing-circuit-to-mpc',
      `${this.latencyStats.meanMs}ms mean, ${this.latencyStats.jitterMs}ms jitter — ${v.band}`,
    );
  }

  private pushBenchDetection(id: string, line: string): void {
    if (this.activeBenchId && this.activeBenchId !== id && id !== this.activeBenchId) {
      // still record on matching result bucket
    }
    this.benchDetections = [line, ...this.benchDetections].slice(0, 40);
    this.benchResults = this.benchResults.map((r) =>
      r.id === id ? { ...r, detections: [line, ...r.detections].slice(0, 40) } : r,
    );
  }

  private remapFocusPorts(): void {
    this.focus.clearPortMaps();
    for (const d of this.registry.list()) {
      for (const p of [...d.inputPortIds, ...d.outputPortIds]) {
        this.focus.mapPort(p, d.id);
      }
    }
  }

  private setStatus(message: string): void {
    this.statusLine = message;
    this.bus.emit({ type: 'studio:status', message, level: 'info' });
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private registerDefaultAssistantTools(): void {
    this.assistant.register({
      id: 'list-devices',
      name: 'List devices',
      description: 'Return current studio devices and capability statuses',
      execute: (_args, ctx) => ({
        focus: ctx.getFocusDeviceId(),
        devices: ctx.listDeviceIds(),
      }),
    });
  }
}

// Wire midi:out latency sampling via prototype patch after construction
const _origGet = StudioRuntime.prototype.getSnapshot;

let singleton: StudioRuntime | null = null;

export function getStudioRuntime(): StudioRuntime {
  if (!singleton) {
    singleton = new StudioRuntime();
    singleton.bus.on('midi:out', (ev) => {
      if (ev.type !== 'midi:out') return;
      const data = ev.message.data;
      if (!data.length) return;
      const status = data[0]!;
      if ((status & 0xf0) === 0x90 && (data[2] ?? 0) > 0) {
        singleton?.recordOutActivity(ev.message.portId);
        const channel = (status & 0x0f) + 1;
        const note = data[1] ?? 0;
        singleton?.recordOutboundLatency(note, channel, ev.message.portId);
      }
    });
  }
  return singleton;
}

void _origGet;
void BENCH_TESTS;
