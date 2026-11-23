/**
 * Vitest behavioural session (plan step 12).
 *
 * ADAPTs the hexatrack panelspec *idea* — inputs + virtual time → outbound MIDI —
 * without the Rust panelspec runner or JSON-lines adapter.
 * Decision: docs/roadmap/panelspec-eval.md
 *
 * Dev-only test helper. Not a product runtime. No SysEx. No clock-forward defaults.
 */
import type { PortId } from '@dawlessdaw/core';
import { MockMidiTransport, type MockPortSpec } from './mock-midi-transport';

export type SentMidi = { portId: PortId; data: Uint8Array; timestamp: number };

export interface BehaviouralSession {
  transport: MockMidiTransport;
  /** Inject inbound MIDI (like panelspec `input`, but MIDI bytes). */
  inject: (portId: PortId, data: number[] | Uint8Array) => void;
  /** Outbound bytes since last clear (like panelspec `events`). */
  sent: () => readonly SentMidi[];
  clearSent: () => void;
  /** True if any sent message is SysEx (status 0xF0) — should stay false in Splot paths. */
  sentHasSysex: () => boolean;
  stop: () => Promise<void>;
}

/**
 * Fresh mock MIDI session for behavioural Vitest cases.
 * Pair with MidiRoutingEngine / StudioCommands / createInjectedClockService in the test.
 */
export async function createBehaviouralSession(
  ports?: MockPortSpec[],
): Promise<BehaviouralSession> {
  const transport = new MockMidiTransport(ports);
  await transport.start();
  return {
    transport,
    inject: (portId, data) => {
      transport.inject(portId, data);
    },
    sent: () => transport.getSent(),
    clearSent: () => transport.clearSent(),
    sentHasSysex: () =>
      transport.getSent().some((s) => s.data.length > 0 && s.data[0] === 0xf0),
    stop: () => transport.stop(),
  };
}
