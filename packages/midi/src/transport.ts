import type { MidiMessage, MidiPortInfo, PortId } from '@dawlessdaw/core';

export type MidiInputHandler = (message: MidiMessage) => void;
export type PortChangeHandler = (ports: MidiPortInfo[]) => void;

export interface HardwareTransport {
  readonly name: string;
  readonly kind: 'web-midi' | 'mock' | 'native-bridge';
  start(): Promise<void>;
  stop(): Promise<void>;
  listPorts(): MidiPortInfo[];
  /**
   * Re-read the current port inventory and notify listeners.
   * Web MIDI may re-request MIDIAccess; cannot invent devices CoreMIDI lacks.
   */
  rescanPorts(): Promise<MidiPortInfo[]>;
  send(portId: PortId, data: Uint8Array, timestamp?: number): void;
  onMessage(handler: MidiInputHandler): () => void;
  onPortsChanged(handler: PortChangeHandler): () => void;
  isAvailable(): boolean;
}
