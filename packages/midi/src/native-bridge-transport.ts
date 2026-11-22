import type { MidiPortInfo, PortId } from '@dawlessdaw/core';
import type { HardwareTransport, MidiInputHandler, PortChangeHandler } from './transport';

/**
 * Stub for a future native MIDI bridge (CoreMIDI / JACK / etc.).
 * Status: unavailable in v0.1 — methods throw or no-op safely.
 */
export class NativeBridgeTransport implements HardwareTransport {
  readonly name = 'NativeBridgeTransport';
  readonly kind = 'native-bridge' as const;

  isAvailable(): boolean {
    return false;
  }

  async start(): Promise<void> {
    throw new Error(
      'NativeBridgeTransport is unavailable in Dawlessdaw v0.1 (stub only). Use WebMidiTransport or MockMidiTransport.',
    );
  }

  async stop(): Promise<void> {
    // no-op
  }

  listPorts(): MidiPortInfo[] {
    return [];
  }

  async rescanPorts(): Promise<MidiPortInfo[]> {
    return [];
  }

  send(_portId: PortId, _data: Uint8Array, _timestamp?: number): void {
    throw new Error('NativeBridgeTransport is unavailable');
  }

  onMessage(_handler: MidiInputHandler): () => void {
    return () => undefined;
  }

  onPortsChanged(_handler: PortChangeHandler): () => void {
    return () => undefined;
  }
}
