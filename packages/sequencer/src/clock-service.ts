/**
 * Shared clock / musical-time seam (plan step 10).
 *
 * Thin facade over Clock Health + musical position so Capture, Transport BPM,
 * Timing Lab, and Memory share one authority. Observation only — reading this
 * service never enables app MIDI clock forwarding (routes stay opt-in).
 *
 * Prefer adapters over rewrites; existing monitors keep their behaviour.
 */

import type {
  ClockHealthConfidence,
  ClockHealthSnapshot,
  ClockHealthStatus,
} from './clock-health';
import type { MusicalPositionSnapshot, TransportState } from './musical-position';

export type MusicalTimeView = Pick<
  MusicalPositionSnapshot,
  'transport' | 'tickCount' | 'bar' | 'beat' | 'stepInBar' | 'bpm'
>;

export interface ClockQualityView {
  status: ClockHealthStatus;
  confidence: ClockHealthConfidence;
  clockDetected: boolean;
  bpm: number | null;
  reason: string;
  lastClockAt: number | null;
  position: Pick<MusicalTimeView, 'transport' | 'bar' | 'beat' | 'bpm'> | null;
}

/**
 * One read API for musical time + clock quality.
 * `appClockForwarding` is always `false` on this seam.
 */
export interface ClockService {
  /** Wall / performance ms — injectable for tests. */
  now(): number;
  getMusicalTime(): MusicalTimeView | null;
  getQuality(): ClockQualityView | null;
  /**
   * Full Timing Lab snapshot when the adapter wraps a real monitor;
   * injected clocks may synthesize a minimal snapshot.
   */
  getHealthSnapshot(): ClockHealthSnapshot | null;
  subscribe(listener: () => void): () => void;
  readonly appClockForwarding: false;
  readonly honesty: 'experimental';
}

export interface ClockServiceAdaptOptions {
  now?: () => number;
  getMusicalTime: () => MusicalTimeView | null | MusicalPositionSnapshot;
  getHealthSnapshot: () => ClockHealthSnapshot | null;
  /** Optional extra subscriptions (e.g. position + health). */
  subscribe?: (listener: () => void) => () => void;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function asMusicalTime(
  snap: MusicalTimeView | MusicalPositionSnapshot | null | undefined,
): MusicalTimeView | null {
  if (!snap) return null;
  return {
    transport: snap.transport,
    tickCount: snap.tickCount,
    bar: snap.bar,
    beat: snap.beat,
    stepInBar: snap.stepInBar,
    bpm: snap.bpm,
  };
}

function qualityFromHealth(h: ClockHealthSnapshot | null): ClockQualityView | null {
  if (!h) return null;
  return {
    status: h.status,
    confidence: h.confidence,
    clockDetected: h.clockDetected,
    bpm: h.bpm,
    reason: h.reason,
    lastClockAt: h.lastClockAt,
    position: h.position
      ? {
          transport: h.position.transport,
          bar: h.position.bar,
          beat: h.position.beat,
          bpm: h.position.bpm,
        }
      : null,
  };
}

/** Adapter over existing musical position + Clock Health monitors. */
export function adaptClockService(opts: ClockServiceAdaptOptions): ClockService {
  const now = opts.now ?? defaultNow;
  return {
    now,
    getMusicalTime: () => asMusicalTime(opts.getMusicalTime()),
    getQuality: () => qualityFromHealth(opts.getHealthSnapshot()),
    getHealthSnapshot: () => opts.getHealthSnapshot(),
    subscribe: (fn) => (opts.subscribe ? opts.subscribe(fn) : () => {}),
    appClockForwarding: false,
    honesty: 'experimental',
  };
}

export interface InjectedClockState {
  nowMs?: number;
  musicalTime?: MusicalTimeView | null;
  health?: ClockHealthSnapshot | null;
}

function emptyHealth(partial?: Partial<ClockHealthSnapshot>): ClockHealthSnapshot {
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
    reason: 'Injected clock — no live MIDI.',
    position: null,
    ...partial,
  };
}

export interface InjectedClockService extends ClockService {
  set(partial: InjectedClockState): void;
  /** Advance injectable wall clock (tests). */
  injectTime(ms: number): void;
  /** Convenience: stable High-confidence clock at bpm with position. */
  injectStableClock(opts: {
    bpm: number;
    tickCount: number;
    bar?: number;
    beat?: number;
    transport?: TransportState;
  }): void;
}

/** Deterministic ClockService for unit tests — no Web MIDI, no routing. */
export function createInjectedClockService(
  initial?: InjectedClockState,
): InjectedClockService {
  let nowMs = initial?.nowMs ?? 0;
  let musicalTime: MusicalTimeView | null = initial?.musicalTime ?? null;
  let health: ClockHealthSnapshot | null = initial?.health ?? null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const fn of listeners) fn();
  };

  const svc: InjectedClockService = {
    appClockForwarding: false,
    honesty: 'experimental',
    now: () => nowMs,
    getMusicalTime: () => (musicalTime ? { ...musicalTime } : null),
    getQuality: () => qualityFromHealth(health),
    getHealthSnapshot: () => (health ? { ...health, position: health.position } : null),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(partial) {
      if (partial.nowMs != null) nowMs = partial.nowMs;
      if (partial.musicalTime !== undefined) musicalTime = partial.musicalTime;
      if (partial.health !== undefined) health = partial.health;
      emit();
    },
    injectTime(ms) {
      nowMs = ms;
      emit();
    },
    injectStableClock(opts) {
      const transport = opts.transport ?? 'playing';
      const bar = opts.bar ?? Math.floor(opts.tickCount / 96) + 1;
      const beat = opts.beat ?? 1;
      musicalTime = {
        transport,
        tickCount: opts.tickCount,
        bar,
        beat,
        stepInBar: 0,
        bpm: opts.bpm,
      };
      health = emptyHealth({
        status: 'STABLE',
        confidence: 'High',
        clockDetected: true,
        bpm: opts.bpm,
        lastClockAt: nowMs,
        reason: `Injected stable ≈ ${opts.bpm} BPM.`,
        position: { transport, bar, beat, bpm: opts.bpm },
      });
      emit();
    },
  };

  return svc;
}

/** Capture-last-N hint shape without importing @dawlessdaw/midi. */
export interface ClockCaptureHint {
  confidence: ClockHealthConfidence;
  status: ClockHealthStatus;
  bpm: number | null;
  clockDetected: boolean;
  position: {
    bar: number;
    beat: number;
    tickCount: number;
    transport: TransportState;
  } | null;
}

export function captureHintFromClockService(svc: ClockService): ClockCaptureHint {
  const q = svc.getQuality();
  const mt = svc.getMusicalTime();
  return {
    confidence: q?.confidence ?? 'Unknown',
    status: q?.status ?? 'UNKNOWN',
    bpm: q?.bpm ?? mt?.bpm ?? null,
    clockDetected: q?.clockDetected ?? false,
    position: mt
      ? {
          bar: mt.bar,
          beat: mt.beat,
          tickCount: mt.tickCount,
          transport: mt.transport,
        }
      : null,
  };
}
