import { describe, it, expect } from 'vitest';
import { createInjectedClockService, type ClockHealthSnapshot } from '@dawlessdaw/sequencer';
import { circuitTempoView, circuitTempoViewFromClock, formatCircuitBpm } from './circuitTempo';

function health(partial: Partial<ClockHealthSnapshot>): ClockHealthSnapshot {
  return {
    honesty: 'experimental',
    status: 'UNKNOWN',
    confidence: 'Unknown',
    clockDetected: false,
    bpm: null,
    bpmFluctuation: null,
    jitterMs: null,
    gapCount: 0,
    restartCount: 0,
    possibleDuplicateSources: false,
    lastClockAt: null,
    lastClockPortId: null,
    recentClockPorts: [],
    reason: 'No MIDI clock heard yet — press Play on the Circuit.',
    position: null,
    ...partial,
  };
}

describe('circuitTempoView', () => {
  it('waits when no clock yet', () => {
    const v = circuitTempoView(health({}), { midiReady: true });
    expect(v.phase).toBe('waiting');
    expect(v.bpm).toBeNull();
    expect(v.label).toMatch(/waiting/i);
  });

  it('shows listening while measuring', () => {
    const v = circuitTempoView(
      health({
        lastClockAt: 1,
        clockDetected: true,
        status: 'UNKNOWN',
        reason: 'Hearing clock — still measuring BPM / jitter.',
      }),
    );
    expect(v.phase).toBe('listening');
  });

  it('shows live BPM when stable', () => {
    const v = circuitTempoView(
      health({
        lastClockAt: 1,
        clockDetected: true,
        status: 'STABLE',
        bpm: 120.4,
        reason: 'Steady',
        position: { transport: 'playing', bar: 3, beat: 2, bpm: 120.4 },
      }),
    );
    expect(v.phase).toBe('live');
    expect(v.bpm).toBe(120.4);
    expect(v.barBeat).toBe('3.2');
    expect(v.label).toBe('Circuit');
  });

  it('marks lost with last BPM kept', () => {
    const v = circuitTempoView(
      health({
        lastClockAt: 1,
        clockDetected: false,
        status: 'CLOCK LOST',
        bpm: 128,
        reason: 'No clock',
      }),
    );
    expect(v.phase).toBe('lost');
    expect(v.bpm).toBe(128);
  });

  it('no-midi phase when MIDI not ready', () => {
    const v = circuitTempoView(null, { midiReady: false });
    expect(v.phase).toBe('no-midi');
    expect(v.label).toBe('—');
  });

  it('formats BPM without trailing .0', () => {
    expect(formatCircuitBpm(120)).toBe('120');
    expect(formatCircuitBpm(120.4)).toBe('120.4');
    expect(formatCircuitBpm(null)).toBe('—');
  });

  it('reads live BPM through ClockService seam without enabling forward', () => {
    const svc = createInjectedClockService();
    expect(svc.appClockForwarding).toBe(false);
    svc.injectStableClock({ bpm: 120, tickCount: 96, bar: 2, beat: 1 });
    const v = circuitTempoViewFromClock(svc, { midiReady: true });
    expect(v.phase).toBe('live');
    expect(v.bpm).toBe(120);
    expect(v.barBeat).toBe('2.1');
    expect(svc.appClockForwarding).toBe(false);
  });
});
