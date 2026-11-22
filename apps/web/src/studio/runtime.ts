import { AssistantToolRegistry, type MidiMessage } from '@dawlessdaw/core';
import { StudioEventBus } from '@dawlessdaw/events';
import {
  FIXTURE_CIRCUIT_GROOVE,
  FIXTURE_CIRCUIT_PROJECT_CHANGE,
  MockMidiTransport,
  NativeBridgeTransport,
  WebMidiTransport,
  type HardwareTransport,
  type MidiFixture,
} from '@dawlessdaw/midi';
import { MidiRoutingEngine, type MidiRoute } from '@dawlessdaw/routing';
import { FocusEngine } from '@dawlessdaw/focus';
import {
  BENCH_TESTS,
  CircuitRhythmInterpreter,
  DEFAULT_SECTION_BRIDGE,
  DeviceRegistry,
  MPC_MUTE_LEARN_CC,
  MPC_MUTE_LEARN_CHANNEL,
  MY_STUDIO_ROLES,
  STORAGE_KEY_STUDIO_SETUP,
  assignPort,
  buildBenchExport,
  buildMyStudioRoutes,
  buildPanicMessages,
  emptyBenchResults,
  latencyVerdict,
  matchPortsToRoles,
  portsForRoles,
  resolveSectionBridge,
  type BenchExport,
  type BenchTestResult,
  type BenchVerdict,
  type CircuitInterpretation,
  type PersistedStudioSetup,
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

export type WorkspaceId =
  | 'studio'
  | 'patchbay'
  | 'performance'
  | 'library'
  | 'sessions'
  | 'settings'
  | 'bench'
  | 'bridge';

export interface StudioRuntimeSnapshot {
  simulation: boolean;
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
  routeClockThroughApp: boolean;
  sectionBridge: SectionBridgeConfig;
  benchResults: BenchTestResult[];
  benchDetections: string[];
  latencyStats: { samples: number; meanMs: number; jitterMs: number; message: string } | null;
  capturingSceneMidi: boolean;
}

type Listener = () => void;

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
  private mock: MockMidiTransport;
  private routing: MidiRoutingEngine;
  private simulation = true;
  private session: DawlessdawSession = createEmptySession('My Studio', true);
  private workspace: WorkspaceId = 'studio';
  private statusLine = 'Simulation mode — mock hardware';
  private recentUiEvents: StudioRuntimeSnapshot['recentUiEvents'] = [];
  private lastCircuitGesture: CircuitInterpretation | null = null;
  private circuitInterpreter = new CircuitRhythmInterpreter();
  private assignments: PortAssignment[] = MY_STUDIO_ROLES.map((r) => ({
    roleId: r.id,
    inputPortId: null,
    outputPortId: null,
    connected: r.id === 'zed',
  }));
  private routeClockThroughApp = false;
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
  private activeBenchId: string | null = null;
  private listeners = new Set<Listener>();
  private unsubs: Array<() => void> = [];
  private started = false;

  constructor() {
    this.mock = new MockMidiTransport();
    this.transport = this.mock;
    this.routing = new MidiRoutingEngine(this.transport, this.bus);
    const saved = loadSetup();
    if (saved?.assignments?.length) this.assignments = saved.assignments;
    if (saved) this.routeClockThroughApp = Boolean(saved.routeClockThroughApp);
    this.registerDefaultAssistantTools();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): StudioRuntimeSnapshot {
    return {
      simulation: this.simulation,
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
      routeClockThroughApp: this.routeClockThroughApp,
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
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.transport.start();
    this.routing.start();

    if (this.simulation) {
      this.bootstrapSimulation();
    } else {
      this.syncLivePorts(this.transport.listPorts());
      this.applyMyStudioRoutes();
    }

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
        if (!this.simulation) {
          this.syncLivePorts(ports);
          this.applyMyStudioRoutes();
          this.pushBenchDetection('reconnect', `ports changed (${ports.length})`);
          this.notify();
        }
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

    this.setStatus(
      this.simulation
        ? 'Simulation — mock hardware (My Studio plan ready)'
        : 'Live MIDI — clock stays on your thru box unless enabled in Settings',
    );
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

  async setSimulation(on: boolean): Promise<void> {
    if (on === this.simulation) return;
    await this.stop();
    this.simulation = on;
    this.session = { ...this.session, simulation: on };

    if (on) {
      this.mock = new MockMidiTransport();
      this.transport = this.mock;
    } else {
      const web = new WebMidiTransport();
      if (!web.isAvailable()) {
        this.simulation = true;
        this.transport = this.mock;
        this.setStatus('Web MIDI unavailable — staying in simulation');
      } else {
        this.transport = web;
      }
    }

    this.routing = new MidiRoutingEngine(this.transport, this.bus);
    this.started = false;
    await this.start();
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
    this.routing.setClockAuthority(portId);
    this.notify();
  }

  setRouteClockThroughApp(on: boolean): void {
    this.routeClockThroughApp = on;
    this.applyMyStudioRoutes();
    this.persistSetup();
    this.setStatus(
      on
        ? 'App clock forwarding ON — usually leave this OFF (use thru box)'
        : 'App clock forwarding OFF — hardware thru box is clock path',
    );
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
      forwardClock: this.routeClockThroughApp,
    }).map((r) => ({
      ...r,
      destinations: r.destinations.filter((d) => !d.portId.startsWith('__missing_')),
    }));

    this.routing.setRoutes(routes.filter((r) => r.destinations.length > 0));
    this.routing.setClockAuthority(
      this.routeClockThroughApp ? p.circuitIn : null,
    );
    this.arranger.configure({
      kind: 'circuit-rhythm',
      deviceId: 'device:circuit-rhythm',
      label: 'My Studio — Circuit arranger (direct sequencing)',
    });
  }

  playFixture(fixture: MidiFixture = FIXTURE_CIRCUIT_GROOVE): void {
    if (!(this.transport instanceof MockMidiTransport)) {
      this.setStatus('Fixtures require simulation mode');
      return;
    }
    this.setStatus(`Playing fixture: ${fixture.name}`);
    this.transport.playFixture(fixture);
  }

  playProjectChangeFixture(): void {
    this.playFixture(FIXTURE_CIRCUIT_PROJECT_CHANGE);
  }

  injectNote(portId: string, note = 60, velocity = 100, channel = 1): void {
    if (!(this.transport instanceof MockMidiTransport)) return;
    this.transport.inject(portId, [0x90 | ((channel - 1) & 0x0f), note, velocity]);
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
    if (!this.simulation) this.applyMyStudioRoutes();
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
      simulation: snap.simulation,
      updatedAt: Date.now(),
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
    this.notify();
  }

  updateSectionBridgeRow(index: number, patch: Partial<SectionBridgeConfig['rows'][0]>): void {
    const rows = this.sectionBridge.rows.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    this.sectionBridge = { ...this.sectionBridge, rows };
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
    this.transport.send(spOut, new Uint8Array([0xc0, program & 0x7f]));
    this.pushBenchDetection('sp-pattern-pc', `sent PC ${program} → SP`);
    this.setStatus(`Sent Program Change ${program} to SP-404 (verify on hardware)`);
  }

  sendBenchMpcProgramChange(program = 0): void {
    const mpcOut = portsForRoles(this.assignments).mpcOut;
    if (!mpcOut) {
      this.setStatus('MPC output port not assigned');
      return;
    }
    this.transport.send(mpcOut, new Uint8Array([0xc0, program & 0x7f]));
    this.pushBenchDetection('mpc-sequence-pc', `sent PC ${program} → MPC`);
    this.setStatus(`Sent Program Change ${program} to MPC (verify on hardware)`);
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
    this.assignments = matchPortsToRoles(ports, this.assignments);
    this.registry.syncFromPorts(ports);
    this.registry.ensureZed();
    this.remapFocusPorts();
    this.persistSetup();
  }

  private persistSetup(): void {
    saveSetup({
      version: 1,
      assignments: this.assignments,
      routeClockThroughApp: this.routeClockThroughApp,
      lastRoutingPresetId: 'my-studio',
    });
  }

  private handleIncoming(message: MidiMessage, deviceId?: string): void {
    const circuitIn = portsForRoles(this.assignments).circuitIn;
    const fromCircuit = circuitIn && message.portId === circuitIn;

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
        this.pushBenchDetection(
          'circuit-notes-1-8',
          `note ch${message.channel} n${message.note}`,
        );
        this.pendingNoteIns.set(
          `${message.channel}:${message.note}`,
          typeof performance !== 'undefined' ? performance.now() : Date.now(),
        );
      }

      if (interpreted.gesture === 'sequencer-stream' || interpreted.gesture === 'background') {
        this.notify();
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

  private logMidi(message: MidiMessage): void {
    const summary = `${message.kind} ch${message.channel ?? '-'} ${Array.from(message.data).join(',')}`;
    this.rawMidiLog = [
      ...this.rawMidiLog.slice(-1999),
      {
        at: Date.now(),
        portId: message.portId,
        data: Array.from(message.data),
        summary,
      },
    ];
    if (this.capturingSceneMidi || this.activeBenchId === 'circuit-scene-any-midi') {
      this.benchDetections = [`${summary}`, ...this.benchDetections].slice(0, 80);
    }

    // Latency: when we see matching note leave via route-fired isn't easy; approximate
    // by measuring time between circuit note-in and any subsequent midi:out on mpc
    if (message.portId === portsForRoles(this.assignments).mpcOut) {
      // outbound logged separately
    }
  }

  /** Hook used after routing sends — call from bus midi:out */
  recordOutboundLatency(note: number, channel: number): void {
    const key = `${channel}:${note}`;
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

  private bootstrapSimulation(): void {
    this.registry.seedSimulation();
    this.assignments = matchPortsToRoles(this.transport.listPorts(), []);
    this.remapFocusPorts();
    this.applyMyStudioRoutes();
    try {
      const a = this.saveScene('Default Patch');
      const b = this.saveScene('Project Bridge B');
      this.sectionBridge = {
        enabled: true,
        rows: [
          {
            projectIndex: 1,
            spProgramChange: 0,
            mpcProgramChange: 0,
            sceneId: a.id,
            label: 'Section A',
          },
          {
            projectIndex: 2,
            spProgramChange: 1,
            mpcProgramChange: 1,
            sceneId: b.id,
            label: 'Section B',
          },
        ],
      };
    } catch {
      // ignore
    }
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
        simulation: ctx.isSimulation(),
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
        const channel = (status & 0x0f) + 1;
        const note = data[1] ?? 0;
        singleton?.recordOutboundLatency(note, channel);
      }
    });
  }
  return singleton;
}

void _origGet;
void BENCH_TESTS;
