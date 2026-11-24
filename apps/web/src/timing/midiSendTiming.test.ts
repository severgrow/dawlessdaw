import { describe, expect, it, vi } from 'vitest';
import { buildNoteOn, parseMidiMessage } from '@dawlessdaw/core';
import { StudioEventBus } from '@dawlessdaw/events';
import { MockMidiTransport } from '@dawlessdaw/midi';
import { MidiRoutingEngine } from '@dawlessdaw/routing';
import { MidiSendTiming } from './midiSendTiming';

describe('MIDI send timing', () => {
  it('pairs repeated hits with their own input, even after transpose and output fan-out', async () => {
    let now = 100;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const transport = new MockMidiTransport();
      await transport.start();
      const bus = new StudioEventBus();
      const routes = new MidiRoutingEngine(transport, bus);
      const timing = new MidiSendTiming();
      bus.on('midi:out', (event) => {
        if (event.type !== 'midi:out' || !event.timing || !event.routeId) return;
        timing.record(event.timing, event.message, event.routeId, event.message.portId === 'mpc');
      });
      routes.setRoutes([{
        id: 'drums',
        name: 'Drums',
        enabled: true,
        sourcePortId: 'circuit',
        destinations: [{ portId: 'mpc' }, { portId: 'sp' }],
        channel: { allow: [1], remap: { 1: 9 } },
        note: { transpose: 12 },
      }]);
      const pad = (at: number) => parseMidiMessage(buildNoteOn(1, 36, 100), at, 'circuit');

      routes.handleIncoming(pad(99));
      now = 482;
      routes.handleIncoming(pad(480));
      now = 510;
      routes.inject(pad(510), 507);
      routes.inject(pad(515)); // Pattern's scheduled note lacks Song timing.

      expect(timing.stats('live')).toEqual({ samples: 2, meanMs: 1.5, jitterMs: 0.5, maxMs: 2 });
      expect(timing.stats('song')).toEqual({ samples: 1, meanMs: 3, jitterMs: 0, maxMs: 3 });
      expect(timing.exportTrace().map((sample) => [sample.delayMs, sample.output.port]))
        .toEqual([[1, 'mpc'], [1, 'sp'], [2, 'mpc'], [2, 'sp'], [3, 'mpc'], [3, 'sp']]);
      expect(timing.exportTrace()[0]).toMatchObject({
        routeId: 'drums', input: { channel: 1, note: 36 }, output: { channel: 9, note: 48 },
      });
      timing.reset();
      expect(timing.stats('live')).toBeNull();
      expect(timing.stats('song')).toBeNull();
      expect(timing.exportTrace()).toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });
});
