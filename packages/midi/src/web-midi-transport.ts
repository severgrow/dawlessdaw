import type { MidiMessage, MidiPortInfo, PortId } from '@nervos/core';
import { parseMidiMessage } from '@nervos/core';
import type { HardwareTransport, MidiInputHandler, PortChangeHandler } from './transport';

type MidiAccessLike = {
  inputs: Map<string, MIDIInput>;
  outputs: Map<string, MIDIOutput>;
  onstatechange: ((ev: Event) => void) | null;
};

/**
 * Browser Web MIDI transport. Verified against the Web MIDI API surface;
 * real hardware attachment remains untested in CI.
 */
export class WebMidiTransport implements HardwareTransport {
  readonly name = 'WebMidiTransport';
  readonly kind = 'web-midi' as const;

  private access: MidiAccessLike | null = null;
  private messageHandlers = new Set<MidiInputHandler>();
  private portHandlers = new Set<PortChangeHandler>();
  private boundInputs = new Map<string, (ev: MIDIMessageEvent) => void>();

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
      this.rebindInputs();
      this.emitPorts();
    };
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
    if (this.access) this.access.onstatechange = null;
    this.access = null;
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

  send(portId: PortId, data: Uint8Array, timestamp?: number): void {
    const output = this.access?.outputs.get(portId);
    if (!output) return;
    output.send(Array.from(data), timestamp);
  }

  onMessage(handler: MidiInputHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPortsChanged(handler: PortChangeHandler): () => void {
    this.portHandlers.add(handler);
    return () => this.portHandlers.delete(handler);
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
