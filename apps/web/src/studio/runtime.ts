import { AssistantToolRegistry, type MidiMessage } from '@nervos/core';
import { StudioEventBus } from '@nervos/events';
import {
  FIXTURE_CIRCUIT_GROOVE,
  FIXTURE_CIRCUIT_PROJECT_CHANGE,
  MockMidiTransport,
  NativeBridgeTransport,
  WebMidiTransport,
  type HardwareTransport,
  type MidiFixture,
} from '@nervos/midi';
import { MidiRoutingEngine, type MidiRoute } from '@nervos/routing';
import { FocusEngine } from '@nervos/focus';
import {
  CircuitRhythmInterpreter,
  DeviceRegistry,
  buildDirectSequencingRoutes,
  defaultCircuitArrangerProfile,
  enrichRoleBindings,
  resolveSceneForProject,
  type CircuitInterpretation,
  type ProjectSceneMapEntry,
} from '@nervos/devices';
import {
  ConfigurableArrangerProvider,
  RoleResolver,
  SceneStore,
  validateScene,
  type StudioScene,
} from '@nervos/scenes';
import {
  createEmptySession,
  exportSessionJson,
  importSessionJson,
  type NervosSession,
} from '@nervos/sessions';
import { MemoryRepository } from '@nervos/storage';

export type WorkspaceId =
  | 'studio'
  | 'patchbay'
  | 'performance'
  | 'library'
  | 'sessions'
  | 'settings';

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
  session: NervosSession;
  workspace: WorkspaceId;
  statusLine: string;
  recentUiEvents: { type: string; summary: string; at: number }[];
  /** Last Circuit Rhythm interpretation (sim/live) — not hardware-proof. */
  lastCircuitGesture: CircuitInterpretation | null;
}

type Listener = () => void;

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
  readonly sessionRepo = new MemoryRepository<NervosSession>();

  private transport: HardwareTransport;
  private mock: MockMidiTransport;
  private routing: MidiRoutingEngine;
  private simulation = true;
  private session: NervosSession = createEmptySession('Untitled Studio', true);
  private workspace: WorkspaceId = 'studio';
  private statusLine = 'Simulation mode — mock hardware';
  private recentUiEvents: StudioRuntimeSnapshot['recentUiEvents'] = [];
  private lastCircuitGesture: CircuitInterpretation | null = null;
  private projectSceneMap: ProjectSceneMapEntry[] = [];
  private circuitInterpreter = new CircuitRhythmInterpreter();
  private listeners = new Set<Listener>();
  private unsubs: Array<() => void> = [];
  private started = false;

  constructor() {
    this.mock = new MockMidiTransport();
    this.transport = this.mock;
    this.routing = new MidiRoutingEngine(this.transport, this.bus);
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
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.transport.start();
    this.routing.start();

    if (this.simulation) {
      this.bootstrapSimulation();
    }

    this.unsubs.push(
      this.transport.onMessage((message) => {
        const deviceId = this.registry.deviceForPort(message.portId);
        this.bus.emit({ type: 'midi:in', message, deviceId });
        this.handleCircuitAwareMidi(message, deviceId);
        // routing already subscribed to transport
      }),
    );

    this.unsubs.push(
      this.transport.onPortsChanged((ports) => {
        if (!this.simulation) {
          this.registry.syncFromPorts(ports);
          this.registry.ensureZed();
          this.remapFocusPorts();
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

    this.unsubs.push(
      this.bus.on('focus:changed', () => this.notify()),
    );

    this.setStatus(this.simulation ? 'Simulation mode — mock hardware' : 'Live Web MIDI');
    this.notify();
  }

  async stop(): Promise<void> {
    for (const u of this.unsubs) u();
    this.unsubs = [];
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

  /** Native bridge stub accessor — unavailable. */
  getNativeBridgeStub(): NativeBridgeTransport {
    return new NativeBridgeTransport();
  }

  setWorkspace(workspace: WorkspaceId): void {
    this.workspace = workspace;
    this.notify();
  }

  setRoutes(routes: MidiRoute[]): void {
    this.routing.setRoutes(routes);
    this.notify();
  }

  setClockAuthority(portId: string | null): void {
    this.routing.setClockAuthority(portId);
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
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join('; '));
    }
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
    this.routing.setRoutes(scene.routes);
    this.routing.setClockAuthority(scene.clockAuthorityPortId);
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
    const session: NervosSession = {
      ...this.session,
      scenes: snap.scenes,
      activeSceneId: snap.activeSceneId,
      routingPresets: [
        {
          id: 'live',
          name: 'Live routes',
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
    if (!result.ok || !result.session) {
      throw new Error(result.errors.join('; '));
    }
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

  configureCircuitArranger(): void {
    const circuit = this.registry.list().find((d) => d.kind === 'circuit-rhythm');
    this.arranger.configure({
      kind: 'circuit-rhythm',
      deviceId: circuit?.id ?? null,
      label: 'Circuit Rhythm (direct-sequencing arranger)',
    });
    if (circuit?.inputPortIds[0]) {
      const sp = this.registry.list().find((d) => d.kind === 'sp404mkii');
      const mpc = this.registry.list().find((d) => d.kind === 'mpc-one');
      const fm1 = this.registry.list().find((d) => d.kind === 'm-vave-fm1');
      const destinations = {
        spOut: sp?.outputPortIds[0],
        mpcOut: mpc?.outputPortIds[0],
        fm1Out: fm1?.outputPortIds[0],
      };
      this.roles.setBindings(
        enrichRoleBindings(circuit.id, destinations, {
          sp: sp?.id,
          mpc: mpc?.id,
          fm1: fm1?.id,
        }),
      );
      const profile = defaultCircuitArrangerProfile(
        circuit.id,
        circuit.inputPortIds[0],
        destinations,
      );
      profile.projectSceneMap = this.projectSceneMap;
      const routes = buildDirectSequencingRoutes(profile);

      // Optional FM1 → MPC controller path (unchanged utility)
      if (fm1?.inputPortIds[0] && mpc?.outputPortIds[0]) {
        routes.push({
          id: 'fm1-to-mpc',
          name: 'FM1 → MPC',
          enabled: true,
          sourcePortId: fm1.inputPortIds[0],
          destinations: [{ portId: mpc.outputPortIds[0] }],
          forwardClock: false,
        });
      }

      this.routing.setRoutes(routes);
      this.routing.setClockAuthority(circuit.inputPortIds[0]);
    }
    this.notify();
  }

  /** Map Circuit Project slot (1–64) → NervOS Studio Scene id. */
  setProjectSceneMap(map: ProjectSceneMapEntry[]): void {
    this.projectSceneMap = map.map((e) => ({ ...e }));
    this.notify();
  }

  private handleCircuitAwareMidi(message: MidiMessage, deviceId?: string): void {
    const device = deviceId ? this.registry.get(deviceId) : undefined;
    if (device?.kind === 'circuit-rhythm') {
      const interpreted = this.circuitInterpreter.interpret(message);
      this.lastCircuitGesture = interpreted;

      if (interpreted.gesture === 'arrangement' && interpreted.projectIndex) {
        const sceneId = resolveSceneForProject(
          this.projectSceneMap,
          interpreted.projectIndex,
        );
        if (sceneId) {
          this.recallScene(sceneId);
          this.setStatus(
            `Circuit Project ${interpreted.projectIndex} → scene ${sceneId} (mapped)`,
          );
        } else {
          this.bus.emit({
            type: 'studio:status',
            message: `Circuit Project ${interpreted.projectIndex} (${interpreted.projectChangeKind}) — no NervOS scene mapped`,
            level: 'info',
          });
        }
        this.notify();
        return; // arrangement does not thrash focus
      }

      if (interpreted.gesture === 'sequencer-stream' || interpreted.gesture === 'background') {
        // Keep routing; skip focus thrash on dense sequencer / clock
        this.notify();
        return;
      }

      if (interpreted.focusWorthy) {
        this.focus.onMidi(message, deviceId);
      }
      this.notify();
      return;
    }

    this.focus.onMidi(message, deviceId);
  }

  private bootstrapSimulation(): void {
    this.registry.seedSimulation();
    this.remapFocusPorts();
    this.configureCircuitArranger();
    // Seed scenes for Project PGM → Scene demo (simulation only)
    try {
      const a = this.saveScene('Default Patch');
      const b = this.saveScene('Project Bridge B');
      this.projectSceneMap = [
        { projectIndex: 1, sceneId: a.id },
        { projectIndex: 2, sceneId: b.id },
      ];
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

let singleton: StudioRuntime | null = null;

export function getStudioRuntime(): StudioRuntime {
  if (!singleton) singleton = new StudioRuntime();
  return singleton;
}
