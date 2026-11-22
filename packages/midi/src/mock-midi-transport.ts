import type { MidiMessage, MidiPortInfo, PortId } from '@nervos/core';
import { parseMidiMessage } from '@nervos/core';
import type { HardwareTransport, MidiInputHandler, PortChangeHandler } from './transport';

export interface MockPortSpec {
  id: PortId;
  name: string;
  manufacturer?: string;
  type: 'input' | 'output';
}

export interface MidiFixtureEvent {
  /** ms offset from fixture start */
  at: number;
  portId: PortId;
  data: number[];
}

export interface MidiFixture {
  id: string;
  name: string;
  events: MidiFixtureEvent[];
}

const DEFAULT_PORTS: MockPortSpec[] = [
  { id: 'mock-mpc-in', name: 'MPC One MIDI In', manufacturer: 'Akai', type: 'input' },
  { id: 'mock-mpc-out', name: 'MPC One MIDI Out', manufacturer: 'Akai', type: 'output' },
  { id: 'mock-sp404-in', name: 'SP-404MKII MIDI In', manufacturer: 'Roland', type: 'input' },
  { id: 'mock-sp404-out', name: 'SP-404MKII MIDI Out', manufacturer: 'Roland', type: 'output' },
  { id: 'mock-circuit-in', name: 'Circuit Rhythm MIDI In', manufacturer: 'Novation', type: 'input' },
  { id: 'mock-circuit-out', name: 'Circuit Rhythm MIDI Out', manufacturer: 'Novation', type: 'output' },
  { id: 'mock-fm1-in', name: 'M-VAVE FM1 MIDI In', manufacturer: 'M-VAVE', type: 'input' },
  { id: 'mock-fm1-out', name: 'M-VAVE FM1 MIDI Out', manufacturer: 'M-VAVE', type: 'output' },
];

/**
 * Deterministic mock transport for simulation mode and tests.
 */
export class MockMidiTransport implements HardwareTransport {
  readonly name = 'MockMidiTransport';
  readonly kind = 'mock' as const;

  private ports: MidiPortInfo[];
  private messageHandlers = new Set<MidiInputHandler>();
  private portHandlers = new Set<PortChangeHandler>();
  private sent: { portId: PortId; data: Uint8Array; timestamp: number }[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private playing = false;
  private started = false;

  constructor(ports: MockPortSpec[] = DEFAULT_PORTS) {
    this.ports = ports.map((p) => ({
      ...p,
      state: 'connected' as const,
    }));
  }

  isAvailable(): boolean {
    return true;
  }

  async start(): Promise<void> {
    this.started = true;
    this.emitPorts();
  }

  async stop(): Promise<void> {
    this.stopFixture();
    this.started = false;
  }

  listPorts(): MidiPortInfo[] {
    return [...this.ports];
  }

  send(portId: PortId, data: Uint8Array, timestamp?: number): void {
    this.sent.push({ portId, data: new Uint8Array(data), timestamp: timestamp ?? performanceNow() });
  }

  getSent(): readonly { portId: PortId; data: Uint8Array; timestamp: number }[] {
    return this.sent;
  }

  clearSent(): void {
    this.sent = [];
  }

  onMessage(handler: MidiInputHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPortsChanged(handler: PortChangeHandler): () => void {
    this.portHandlers.add(handler);
    return () => this.portHandlers.delete(handler);
  }

  /** Inject a message immediately (tests / manual sim). */
  inject(portId: PortId, data: number[] | Uint8Array, timestamp = performanceNow()): MidiMessage {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const message = parseMidiMessage(bytes, timestamp, portId);
    for (const h of this.messageHandlers) h(message);
    return message;
  }

  /** Replay a fixture on a timeline (setTimeout). Returns stop handle. */
  playFixture(fixture: MidiFixture, speed = 1): () => void {
    this.stopFixture();
    this.playing = true;
    for (const ev of fixture.events) {
      const delay = Math.max(0, ev.at / speed);
      const timer = setTimeout(() => {
        if (!this.playing) return;
        this.inject(ev.portId, ev.data, performanceNow());
      }, delay);
      this.timers.push(timer);
    }
    return () => this.stopFixture();
  }

  /** Synchronous deterministic replay (tests). */
  replaySync(fixture: MidiFixture): MidiMessage[] {
    const out: MidiMessage[] = [];
    for (const ev of fixture.events) {
      out.push(this.inject(ev.portId, ev.data, ev.at));
    }
    return out;
  }

  stopFixture(): void {
    this.playing = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  setPortConnected(portId: PortId, connected: boolean): void {
    this.ports = this.ports.map((p) =>
      p.id === portId ? { ...p, state: connected ? 'connected' : 'disconnected' } : p,
    );
    this.emitPorts();
  }

  private emitPorts(): void {
    const ports = this.listPorts();
    for (const h of this.portHandlers) h(ports);
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Built-in fixture: Circuit drums + bass notes with clock (clock ignored by focus). */
export const FIXTURE_CIRCUIT_GROOVE: MidiFixture = {
  id: 'circuit-groove',
  name: 'Circuit groove (drums ch1, bass ch2)',
  events: [
    { at: 0, portId: 'mock-circuit-in', data: [0xfa] },
    { at: 10, portId: 'mock-circuit-in', data: [0xf8] },
    { at: 20, portId: 'mock-circuit-in', data: [0xf8] },
    { at: 30, portId: 'mock-circuit-in', data: [0x90, 36, 100] }, // kick
    { at: 40, portId: 'mock-circuit-in', data: [0xf8] },
    { at: 80, portId: 'mock-circuit-in', data: [0x90, 36, 0] },
    { at: 100, portId: 'mock-circuit-in', data: [0x91, 40, 90] }, // bass ch2
    { at: 120, portId: 'mock-circuit-in', data: [0xf8] },
    { at: 200, portId: 'mock-circuit-in', data: [0x81, 40, 0] },
    { at: 220, portId: 'mock-mpc-in', data: [0x90, 60, 110] }, // MPC note → focus candidate
    { at: 300, portId: 'mock-mpc-in', data: [0x80, 60, 0] },
    { at: 400, portId: 'mock-sp404-in', data: [0xb0, 1, 64] }, // SP CC
  ],
};

/**
 * Simulated Circuit Project change (ch16 Program Change).
 * Does not prove hardware TX — only exercises NervOS Project→Scene mapping.
 */
export const FIXTURE_CIRCUIT_PROJECT_CHANGE: MidiFixture = {
  id: 'circuit-project-change',
  name: 'Circuit Project PGM ch16 → slot 2 (instant)',
  events: [
    { at: 0, portId: 'mock-circuit-in', data: [0xcf, 1] }, // ch16 PC 1 → project 2 instant
    { at: 50, portId: 'mock-circuit-in', data: [0xb0, 21, 80] }, // macro gesture after
  ],
};
