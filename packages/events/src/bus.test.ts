import { describe, it, expect, vi } from 'vitest';
import { StudioEventBus } from './bus';
import { buildNoteOn } from '@dawlessdaw/core';

describe('StudioEventBus', () => {
  it('retains bounded non-clock history', () => {
    const bus = new StudioEventBus({ historyLimit: 5 });
    for (let i = 0; i < 10; i++) {
      bus.emit({
        type: 'studio:status',
        message: `m${i}`,
        level: 'info',
      });
    }
    expect(bus.getHistory()).toHaveLength(5);
    expect(
      (bus.getHistory()[0] as Extract<ReturnType<typeof bus.getHistory>[number], { type: 'studio:status' }>)
        .message,
    ).toBe('m5');
  });

  it('partitions clock ticks away from main history', () => {
    const bus = new StudioEventBus({ clockHistoryLimit: 3 });
    const clockData = new Uint8Array([0xf8]);
    for (let i = 0; i < 5; i++) {
      bus.emit({
        type: 'midi:in',
        message: {
          data: clockData,
          timestamp: i,
          portId: 'p1',
          kind: 'clock',
        },
      });
    }
    bus.emit({
      type: 'midi:in',
      message: {
        data: buildNoteOn(1, 60, 100),
        timestamp: 100,
        portId: 'p1',
        kind: 'note-on',
        channel: 1,
        note: 60,
        velocity: 100,
      },
    });

    expect(bus.getClockHistory()).toHaveLength(3);
    expect(bus.getHistory()).toHaveLength(1);
    expect(bus.getHistory()[0]!.type).toBe('midi:in');
  });

  it('onUi does not receive midi:clock', () => {
    const bus = new StudioEventBus();
    const ui = vi.fn();
    bus.onUi(ui);
    bus.emit({
      type: 'midi:clock',
      message: { data: new Uint8Array([0xf8]), timestamp: 0, portId: 'p', kind: 'clock' },
    });
    bus.emit({ type: 'studio:status', message: 'ok', level: 'info' });
    expect(ui).toHaveBeenCalledTimes(1);
    expect(ui.mock.calls[0]![0].type).toBe('studio:status');
  });
});
