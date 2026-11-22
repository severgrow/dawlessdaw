import {
  AssistantToolRegistry,
  isClockLike,
  parseMidiMessage,
  type MidiMessage,
} from '@dawlessdaw/core';
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
  buildControllerRoutes,
  clonePreset,
  copyTrack,
  describeIncoming,
  destChannel,
  knobTarget,
  myStudioPreset,
  presetFromTrackPlan,
  sanitizePreset,
  slotCc,
  swapKnobs,
  type ControllerPreset,
  type CtrlDevice,
  type CtrlTrack,
  type KnobSlot,
  legacyTrackPlan,
  sanitizeTrackPlan,
  setTrackSend as withTrackSend,
  trackPreset,
  migrateClockForwarding,
  MY_STUDIO_CHANNEL_REMAP,
  normalizePortId,
  portsForRoles,
  resolveSectionBridge,
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

/** Rig = track routing home · Samples = SP-404 pads · Sections = Section Bridge · Test = bench · Setup = ports. */
export type WorkspaceId = 'rig' | 'controller' | 'samples' | 'sections' | 'test' | 'setup';

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
  /** App forwards Circuit clock/start/stop to the MPC's output (e.g. Scarlett → MPC DIN In). */
  clockToMpc: boolean;
  /** App forwards Circuit clock/start/stop to the SP (normally off: SP uses the thru box). */
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
}

type Listener = () => void;

/** Accept saved Section Bridge rows only if they look right. */
function sanitizeSectionBridge(raw: unknown): SectionBridgeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { enabled?: unknown; rows?: unknown };
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
  return { enabled: Boolean(r.enabled), rows };
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
  private controller: ControllerPreset = clonePreset(myStudioPreset('sp'));
  private controllerPresets: ControllerPreset[] = [];
  private controllerSavedId = BUILTIN_PRESETS[0]!.id;
  private controllerHistory: ControllerPreset[] = [];
  private controllerLearn: StudioRuntimeSnapshot['controllerLearn'] = null;
  private knobValues: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  private lastKnob: StudioRuntimeSnapshot['lastKnob'] = null;
  private activeCircuitTrack: number | null = null;
  private ctrlEvents: StudioRuntimeSnapshot['ctrlEvents'] = [];
  private ctrlNotifyAt = 0;
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
  private activeBenchId: string | null = null;
  private listeners = new Set<Listener>();
  private unsubs: Array<() => void> = [];
  private started = false;

  constructor() {
    this.transport = new WebMidiTransport();
    this.routing = new MidiRoutingEngine(this.transport, this.bus);
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
      spNoteOffset: this.spNoteOffset,
      learningSpPadOffset: this.learningSpPadOffset,
      lastProject: this.lastProject ? { ...this.lastProject } : null,
      sectionBridge: {
        enabled: this.sectionBridge.enabled,
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

  /** Circuit clock/start/stop → MPC output (via the Scarlett this is DIN, so the MPC accepts it). */
  setClockToMpc(on: boolean): void {
    this.clockToMpc = on;
    this.resetClockActivity();
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? this.mpcNoteMode === 'din-only'
          ? 'Circuit clock → MPC is ON but has no effect: MPC is set to "MIDI cable from thru box only"'
          : 'Circuit clock → MPC ON (MPC: Receive = MIDI Clock on its MIDI In)'
        : 'Circuit clock → MPC OFF',
    );
    this.notify();
  }

  /** Circuit clock/start/stop → SP output. Off by default: the SP gets clock from the thru box. */
  setClockToSp(on: boolean): void {
    this.clockToSp = on;
    this.resetClockActivity();
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? 'Circuit clock → SP ON — SP may get double clock if it is still on the thru box'
        : 'Circuit clock → SP OFF (SP follows the thru box)',
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
    this.notify();
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
    const t = message.channel ?? 0;
    if (t < 1 || t > 8) return;
    const isNote = message.kind === 'note-on' && (message.velocity ?? 0) > 0;
    const knob =
      message.kind === 'cc' && message.controller != null
        ? CIRCUIT_MACRO_CCS.indexOf(message.controller as (typeof CIRCUIT_MACRO_CCS)[number])
        : -1;
    if (!isNote && knob < 0) return;
    this.activeCircuitTrack = t;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const learn = this.controllerLearn;
    if (learn?.kind === 'first-note' && isNote && t === learn.track && message.note != null) {
      this.controllerLearn = null;
      this.setControllerTrack(t, { firstNote: message.note });
      this.setStatus(`Learned: Circuit note ${message.note} on T${t} is the first note`);
    } else if (learn?.kind === 'twist' && knob >= 0) {
      this.controllerLearn = null;
      if (knob !== learn.knob) {
        this.changeController(swapKnobs(this.controller, learn.track, learn.knob, knob), `Moved to knob ${knob + 1}`);
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

  setSectionBridge(config: SectionBridgeConfig): void {
    this.sectionBridge = {
      enabled: config.enabled,
      rows: config.rows.map((r) => ({ ...r })),
    };
    this.persistSetup();
    this.notify();
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

      if (interpreted.gesture === 'arrangement' && interpreted.projectIndex != null) {
        this.pushBenchDetection(
          'circuit-project-pgm',
          `Project ${interpreted.projectIndex} (${interpreted.projectChangeKind})`,
        );
        this.runSectionBridge(message.value ?? 0);
        this.notify();
        return;
      }

      if (message.kind === 'note-on' && (message.velocity ?? 0) > 0 && message.channel) {
        if (message.channel >= 1 && message.channel <= 8) {
          this.trackActivity[message.channel] =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
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
    if (!this.anyClockForwarding()) {
      return 'App clock OFF — the SP follows the thru box; turn on Circuit clock → MPC for the MPC via the Scarlett.';
    }
    if (!p.circuitIn) return 'Assign Circuit input in Settings (receive-none until then).';
    const targets = [
      this.clockToMpc && !p.mpcOut ? 'MPC' : null,
      this.clockToSp && !p.spOut ? 'SP' : null,
      this.forwardClockToFm1 && !p.fm1Out ? 'FM1' : null,
    ].filter(Boolean);
    if (targets.length) return `Assign an output for ${targets.join(' + ')} — nothing to forward to.`;
    if (this.clockInTicks === 0) {
      return 'receive-none: no F8/FA from Circuit yet — Clock Tx (pad 32) bright? Circuit playing? Correct Circuit In port?';
    }
    if (this.clockOutTicks === 0) {
      return 'receive-but-not-forwarded: IN alive, OUT dead — press Re-apply My Studio routes.';
    }
    return 'receive-and-forwarded: the app is sending clock. If the MPC does not follow, check MPC Preferences → MIDI/Sync: its MIDI In row on, Receive = MIDI Clock.';
  }

  private recordClockActivity(message: MidiMessage): void {
    const now = Date.now();
    const circuitIn = portsForRoles(this.assignments).circuitIn;
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    const spOut = portsForRoles(this.assignments).spOut;
    const fm1Out = portsForRoles(this.assignments).fm1Out;
    const isIn = circuitIn != null && message.portId === circuitIn;
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
