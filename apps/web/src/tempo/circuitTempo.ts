/**
 * Circuit tempo follow — display model only.
 * BPM from Clock Health / Circuit-in F8. Never enables app clock forwarding.
 */
import type { ClockHealthSnapshot } from '@dawlessdaw/sequencer';

export type CircuitTempoPhase =
  | 'waiting'
  | 'listening'
  | 'live'
  | 'variable'
  | 'lost'
  | 'no-midi';

export interface CircuitTempoView {
  phase: CircuitTempoPhase;
  /** Rounded BPM for big display, or null when unknown. */
  bpm: number | null;
  /** One short status line under the number. */
  label: string;
  /** Longer title/tooltip. */
  detail: string;
  /** Bar.beat when musical position is available. */
  barBeat: string | null;
  honesty: 'experimental';
}

export function circuitTempoView(
  health: ClockHealthSnapshot | null | undefined,
  opts?: { midiReady?: boolean; estimatedBpm?: number | null },
): CircuitTempoView {
  const midiReady = opts?.midiReady !== false;
  const honesty = 'experimental' as const;

  if (!midiReady) {
    return {
      phase: 'no-midi',
      bpm: null,
      label: 'No MIDI',
      detail: 'Allow MIDI in Chrome, then press Play on the Circuit.',
      barBeat: null,
      honesty,
    };
  }

  const bpmRaw = health?.bpm ?? opts?.estimatedBpm ?? null;
  const bpm =
    bpmRaw != null && Number.isFinite(bpmRaw) ? Math.round(bpmRaw * 10) / 10 : null;

  const pos = health?.position;
  const barBeat =
    pos && pos.bar > 0
      ? `${pos.bar}.${pos.beat}`
      : null;

  if (!health || health.lastClockAt == null) {
    return {
      phase: 'waiting',
      bpm: null,
      label: 'Waiting for Circuit',
      detail: 'Press Play on the Circuit — tempo comes from its MIDI clock (USB in).',
      barBeat: null,
      honesty,
    };
  }

  if (health.status === 'CLOCK LOST' || !health.clockDetected) {
    return {
      phase: 'lost',
      bpm,
      label: 'Clock lost',
      detail: health.reason || 'No MIDI clock lately — check Circuit Play / USB.',
      barBeat,
      honesty,
    };
  }

  if (health.status === 'UNKNOWN' || bpm == null) {
    return {
      phase: 'listening',
      bpm,
      label: 'Listening…',
      detail: health.reason || 'Hearing clock — measuring BPM.',
      barBeat,
      honesty,
    };
  }

  if (health.status === 'VARIABLE') {
    return {
      phase: 'variable',
      bpm,
      label: 'Circuit · variable',
      detail: health.reason || 'Clock is a bit unsteady (browser timing).',
      barBeat,
      honesty,
    };
  }

  return {
    phase: 'live',
    bpm,
    label: 'Circuit',
    detail: 'Following Circuit MIDI clock. Machines sync via thru / DIN — app clock stays off.',
    barBeat,
    honesty,
  };
}

/** Format BPM for large display (drop .0). */
export function formatCircuitBpm(bpm: number | null): string {
  if (bpm == null || !Number.isFinite(bpm)) return '—';
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}
