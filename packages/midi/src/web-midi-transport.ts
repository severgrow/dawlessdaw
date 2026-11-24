import type { MidiMessage, MidiPortInfo, PortId } from '@dawlessdaw/core';
import { parseMidiMessage } from '@dawlessdaw/core';
import type { HardwareTransport, MidiInputHandler, PortChangeHandler } from './transport';

type MidiAccessLike = {
  inputs: Map<string, MIDIInput>;
  outputs: Map<string, MIDIOutput>;
  onstatechange: ((ev: Event) => void) | null;
};

function isSystemRealtime(status: number): boolean {
  // Timing Clock, Start, Continue, Stop, Active Sensing, Reset (+ Song Select/SPP are system common)
  return status >= 0xf8 && status <= 0xff;
}

/**
 * Browser Web MIDI transport. Verified against the Web MIDI API surface;
 * real hardware attachment remains untested in CI.
 *
 * Honesty: Chrome delivers MIDI on the main thread. Timing Clock (0xF8) is
 * usable for coarse start/stop + tempo follow, not sample-accurate sync.
 * Prefer DIN thru for tight clock; this path is for USB-only benches.
 */
export class WebMidiTransport implements HardwareTransport {
  readonly name = 'WebMidiTransport';
  readonly kind = 'web-midi' as const;

  private access: MidiAccessLike | null = null;
  private messageHandlers = new Set<MidiInputHandler>();
  private portHandlers = new Set<PortChangeHandler>();
  private boundInputs = new Map<string, (ev: MIDIMessageEvent) => void>();
  private openPromises = new Map<string, Promise<void>>();

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async start(): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Web MIDI is not available in this environment');
    }
    const access = (await navigator.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
    this.access = access;
    access.onstatechange = () => {
      void this.ensurePortsOpen();
      this.rebindInputs();
      this.emitPorts();
    };
    await this.ensurePortsOpen();
    this.rebindInputs();
    this.emitPorts();
  }

  async stop(): Promise<void> {
    for (const [id, handler] of this.boundInputs) {
      const input = this.access?.inputs.get(id);
      if (input) input.onmidimessage = null;
      void handler;
    }
    this.boundInputs.clear();
    this.openPromises.clear();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
  }

  /**
   * Re-request MIDIAccess (keeps message/port listeners) and rebind.
   * Honest: if Audio MIDI Setup has no device, this still returns without it.
   */
  async rescanPorts(): Promise<MidiPortInfo[]> {
    if (!this.isAvailable()) return [];
    if (this.access) this.access.onstatechange = null;
    for (const [id] of this.boundInputs) {
      const input = this.access?.inputs.get(id);
      if (input) input.onmidimessage = null;
    }
    this.boundInputs.clear();
    this.openPromises.clear();
    const access = (await navigator.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
    this.access = access;
    access.onstatechange = () => {
      void this.ensurePortsOpen();
      this.rebindInputs();
      this.emitPorts();
    };
    await this.ensurePortsOpen();
    this.rebindInputs();
    this.emitPorts();
    return this.listPorts();
  }

  listPorts(): MidiPortInfo[] {
    if (!this.access) return [];
    const ports: MidiPortInfo[] = [];
    for (const input of this.access.inputs.values()) {
      ports.push({
        id: input.id,
        name: input.name ?? input.id,
        manufacturer: input.manufacturer ?? undefined,
        type: 'input',
        state: input.state === 'connected' ? 'connected' : 'disconnected',
      });
    }
    for (const output of this.access.outputs.values()) {
      ports.push({
        id: output.id,
        name: output.name ?? output.id,
        manufacturer: output.manufacturer ?? undefined,
        type: 'output',
        state: output.state === 'connected' ? 'connected' : 'disconnected',
      });
    }
    return ports;
  }

  send(portId: PortId, data: Uint8Array, timestamp?: number): boolean {
    const output = this.access?.outputs.get(portId);
    if (!output || output.state === 'disconnected') return false;
    // Kick open if still closed — first messages can otherwise be dropped.
    if (output.connection !== 'open') {
      void this.openPort(output);
    }
    const payload = data.length <= 4 ? data : Array.from(data);
    const status = data[0] ?? 0;
    // System realtime must go immediately. Passing a DOMHighResTimeStamp can
    // queue/delay F8/FA under main-thread load and drop the critical Start.
    try {
      if (timestamp === undefined || isSystemRealtime(status)) output.send(payload);
      else output.send(payload, timestamp);
      return true;
    } catch (error) {
      // The port can disappear between the state check and send().
      if (error instanceof DOMException && error.name === 'InvalidStateError') return false;
      throw error;
    }
  }

  onMessage(handler: MidiInputHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPortsChanged(handler: PortChangeHandler): () => void {
    this.portHandlers.add(handler);
    return () => this.portHandlers.delete(handler);
  }

  private async ensurePortsOpen(): Promise<void> {
    if (!this.access) return;
    const jobs: Promise<void>[] = [];
    for (const input of this.access.inputs.values()) {
      jobs.push(this.openPort(input));
    }
    for (const output of this.access.outputs.values()) {
      jobs.push(this.openPort(output));
    }
    await Promise.allSettled(jobs);
  }

  private openPort(port: MIDIInput | MIDIOutput): Promise<void> {
    const existing = this.openPromises.get(port.id);
    if (existing) return existing;
    if (port.connection === 'open') {
      return Promise.resolve();
    }
    const job = port
      .open()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        // Allow retry after statechange if still closed
        if (port.connection !== 'open') this.openPromises.delete(port.id);
      });
    this.openPromises.set(port.id, job);
    return job;
  }

  private rebindInputs(): void {
    if (!this.access) return;
    for (const [id] of this.boundInputs) {
      const input = this.access.inputs.get(id);
      if (input) input.onmidimessage = null;
    }
    this.boundInputs.clear();
    for (const input of this.access.inputs.values()) {
      const handler = (ev: MIDIMessageEvent) => {
        const bytes = new Uint8Array(ev.data ?? []);
        const message = parseMidiMessage(bytes, ev.timeStamp, input.id);
        for (const h of this.messageHandlers) h(message);
      };
      input.onmidimessage = handler;
      this.boundInputs.set(input.id, handler);
    }
  }

  private emitPorts(): void {
    const ports = this.listPorts();
    for (const h of this.portHandlers) h(ports);
  }
}
