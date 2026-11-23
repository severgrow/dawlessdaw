/**
 * Clock Health (Timing Lab Stage A) — passive monitor of MIDI clock quality.
 *
 * Listens to timing messages already observed (typically Circuit-in).
 * Never becomes a clock master. Never emits MIDI.
 *
 * Status: STABLE | VARIABLE | CLOCK LOST | UNKNOWN
 */

import { PPQN } from './scheduler';
import type { MusicalPositionSnapshot } from './musical-position';

export type ClockHealthStatus = 'STABLE' | 'VARIABLE' | 'CLOCK LOST' | 'UNKNOWN';

export type ClockHealthConfidence = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface ClockHealthSnapshot {
  honesty: 'experimental';
  status: ClockHealthStatus;
  confidence: ClockHealthConfidence;
  /** True when F8 clocks are currently arriving within the loss window. */
  clockDetected: boolean;
  bpm: number | null;
  /** Rolling BPM standard deviation (fluctuation). */
  bpmFluctuation: number | null;
  /** Mean absolute deviation of inter-clock intervals vs expected (ms). */
  jitterMs: number | null;
  /** Count of gaps (interval ≫ expected) since last Start. */
  gapCount: number;
  /** Transport restarts (Start after Stop) observed. */
  restartCount: number;
  /**
   * True if clocks were seen from more than one input port in a short window.
   * Hint only — browser MIDI does not prove “double clock” on the DIN bus.
   */
  possibleDuplicateSources: boolean;
  lastClockAt: number | null;
  lastClockPortId: string | null;
  recentClockPorts: string[];
  /** Plain-English reason for the status. */
  reason: string;
  /** Position mirror from M1 when provided by the host. */
  position: Pick<MusicalPositionSnapshot, 'transport' | 'bar' | 'beat' | 'bpm'> | null;
}

export type ClockHealthListener = () => void;

const LOSS_MS = 400;
const EXPECTED_MS_AT = (bpm: number) => 60_000 / (bpm * PPQN);
const GAP_FACTOR = 2.4;
/** Browser MIDI delivery is main-thread; keep STABLE reachable on real Circuit USB. */
const STABLE_JITTER_MS = 3.5;
const VARIABLE_JITTER_MS = 8;
const STABLE_BPM_FLUCT = 1.5;
const DUP_WINDOW_MS = 800;

export class ClockHealthMonitor {
  private tickTimes: number[] = [];
  private tickPorts: { at: number; portId: string }[] = [];
  private bpmSamples: number[] = [];
  private bpm: number | null = null;
  private gapCount = 0;
  private restartCount = 0;
  private wasStopped = true;
  private lastClockAt: number | null = null;
  private lastClockPortId: string | null = null;
  private lastIntervalMs: number | null = null;
  private position: ClockHealthSnapshot['position'] = null;
  private cached: ClockHealthSnapshot | null = null;
  private listeners = new Set<ClockHealthListener>();
  private lossTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;

  constructor(opts?: { now?: () => number }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  subscribe(fn: ClockHealthListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): ClockHealthSnapshot {
    if (!this.cached) this.cached = this.build();
    return this.cached;
  }

  /** Optional: sync displayed bar/beat from M1 musical position. */
  setPosition(pos: ClockHealthSnapshot['position']): void {
    this.position = pos
      ? { transport: pos.transport, bar: pos.bar, beat: pos.beat, bpm: pos.bpm }
      : null;
    this.emit();
  }

  reset(): void {
    this.clearLossTimer();
    this.tickTimes = [];
    this.tickPorts = [];
    this.bpmSamples = [];
    this.bpm = null;
    this.gapCount = 0;
    this.restartCount = 0;
    this.wasStopped = true;
    this.lastClockAt = null;
    this.lastClockPortId = null;
    this.lastIntervalMs = null;
    this.position = null;
    this.emit();
  }

  onStart(portId?: string): void {
    if (this.wasStopped) this.restartCount += 1;
    this.wasStopped = false;
    this.tickTimes = [];
    this.lastIntervalMs = null;
    if (portId) this.notePort(portId);
    this.emit();
  }

  onContinue(portId?: string): void {
    this.wasStopped = false;
    if (portId) this.notePort(portId);
    this.emit();
  }

  onStop(_portId?: string): void {
    this.wasStopped = true;
    this.clearLossTimer();
    this.emit();
  }

  /**
   * One MIDI Timing Clock (F8).
   * @param portId — input port id for duplicate-source hint
   */
  onClock(portId?: string): void {
    const t = this.now();
    if (this.lastClockAt != null) {
      const interval = t - this.lastClockAt;
      const expected =
        this.bpm != null && this.bpm > 0 ? EXPECTED_MS_AT(this.bpm) : this.lastIntervalMs;
      if (expected != null && interval > expected * GAP_FACTOR) {
        this.gapCount += 1;
      }
      this.lastIntervalMs = interval;
    }
    this.lastClockAt = t;
    this.lastClockPortId = portId ?? this.lastClockPortId;
    this.tickTimes = [...this.tickTimes.slice(-95), t];
    if (portId) this.notePort(portId);

    if (this.tickTimes.length >= 24) {
      const first = this.tickTimes[0]!;
      const last = this.tickTimes[this.tickTimes.length - 1]!;
      const ticks = this.tickTimes.length - 1;
      const msPerTick = (last - first) / ticks;
      const bpm = 60_000 / (msPerTick * PPQN);
      if (Number.isFinite(bpm) && bpm > 20 && bpm < 400) {
        this.bpm = Math.round(bpm * 10) / 10;
        this.bpmSamples = [...this.bpmSamples.slice(-31), this.bpm];
      }
    }

    this.armLossTimer();
    // Throttle UI: emit every 6 clocks (~16th) or on first few.
    if (this.tickTimes.length < 8 || this.tickTimes.length % 6 === 0) this.emit();
  }

  onMidiTransport(kind: string, portId?: string): void {
    if (kind === 'clock') this.onClock(portId);
    else if (kind === 'start') this.onStart(portId);
    else if (kind === 'continue') this.onContinue(portId);
    else if (kind === 'stop') this.onStop(portId);
  }

  /**
   * Clock on a non-authority input port — duplicate-source hint only.
   * Does not update BPM / jitter (authority stays Circuit-in).
   */
  observeOtherClockPort(portId: string): void {
    this.notePort(portId);
    this.emit();
  }

  private notePort(portId: string): void {
    const at = this.now();
    this.tickPorts = [...this.tickPorts.filter((p) => at - p.at <= DUP_WINDOW_MS), { at, portId }];
  }

  private armLossTimer(): void {
    this.clearLossTimer();
    this.lossTimer = setTimeout(() => {
      this.lossTimer = null;
      // Treat silence as a stop so the next Start counts as a reconnect restart (A3).
      this.wasStopped = true;
      this.emit();
    }, LOSS_MS + 50);
  }

  private clearLossTimer(): void {
    if (this.lossTimer) {
      clearTimeout(this.lossTimer);
      this.lossTimer = null;
    }
  }

  private build(): ClockHealthSnapshot {
    const now = this.now();
    const age = this.lastClockAt != null ? now - this.lastClockAt : Number.POSITIVE_INFINITY;
    const clockDetected = this.lastClockAt != null && age <= LOSS_MS;

    const uniquePorts = [...new Set(this.tickPorts.map((p) => p.portId))];
    const possibleDuplicateSources = uniquePorts.length > 1;

    const jitterMs = this.computeJitterMs();
    const bpmFluctuation = this.computeBpmFluctuation();

    let status: ClockHealthStatus = 'UNKNOWN';
    let confidence: ClockHealthConfidence = 'Unknown';
    let reason = 'No MIDI clock heard yet — press Play on the Circuit.';

    if (this.lastClockAt == null) {
      status = 'UNKNOWN';
      confidence = 'Unknown';
    } else if (!clockDetected) {
      status = 'CLOCK LOST';
      confidence = 'High';
      reason = `No clock for ${Math.round(age)} ms — check Circuit Play / USB.`;
    } else if (this.tickTimes.length < 24) {
      status = 'UNKNOWN';
      confidence = 'Low';
      reason = 'Hearing clock — still measuring BPM / jitter.';
    } else if (
      jitterMs != null &&
      jitterMs <= STABLE_JITTER_MS &&
      (bpmFluctuation == null || bpmFluctuation <= STABLE_BPM_FLUCT) &&
      !possibleDuplicateSources
    ) {
      status = 'STABLE';
      confidence = 'High';
      reason = `Steady clock ≈ ${this.bpm} BPM · jitter ${jitterMs.toFixed(1)} ms.`;
    } else if (
      jitterMs != null &&
      (jitterMs > VARIABLE_JITTER_MS ||
        (bpmFluctuation != null && bpmFluctuation > STABLE_BPM_FLUCT * 2) ||
        possibleDuplicateSources ||
        this.gapCount > 0)
    ) {
      status = 'VARIABLE';
      confidence = possibleDuplicateSources ? 'Medium' : 'High';
      const bits: string[] = [];
      if (jitterMs > VARIABLE_JITTER_MS) bits.push(`jitter ${jitterMs.toFixed(1)} ms`);
      if (bpmFluctuation != null && bpmFluctuation > STABLE_BPM_FLUCT)
        bits.push(`BPM ±${bpmFluctuation.toFixed(1)}`);
      if (this.gapCount > 0) bits.push(`${this.gapCount} gap(s)`);
      if (possibleDuplicateSources) bits.push('possible duplicate clock sources');
      reason = `Unsteady clock — ${bits.join(' · ')}.`;
    } else {
      status = 'VARIABLE';
      confidence = 'Medium';
      reason = `Mild variation — jitter ${jitterMs?.toFixed(1) ?? '—'} ms.`;
    }

    return {
      honesty: 'experimental',
      status,
      confidence,
      clockDetected,
      bpm: this.bpm,
      bpmFluctuation,
      jitterMs,
      gapCount: this.gapCount,
      restartCount: this.restartCount,
      possibleDuplicateSources,
      lastClockAt: this.lastClockAt,
      lastClockPortId: this.lastClockPortId,
      recentClockPorts: uniquePorts,
      reason,
      position: this.position,
    };
  }

  private computeJitterMs(): number | null {
    if (this.tickTimes.length < 12) return null;
    const intervals: number[] = [];
    for (let i = 1; i < this.tickTimes.length; i++) {
      intervals.push(this.tickTimes[i]! - this.tickTimes[i - 1]!);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const mad =
      intervals.reduce((a, b) => a + Math.abs(b - mean), 0) / intervals.length;
    return Math.round(mad * 100) / 100;
  }

  private computeBpmFluctuation(): number | null {
    if (this.bpmSamples.length < 4) return null;
    const mean =
      this.bpmSamples.reduce((a, b) => a + b, 0) / this.bpmSamples.length;
    const variance =
      this.bpmSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / this.bpmSamples.length;
    return Math.round(Math.sqrt(variance) * 100) / 100;
  }

  exportDiagnostic(): Record<string, unknown> {
    const snap = this.getSnapshot();
    return {
      ...snap,
      exportedAt: new Date().toISOString(),
      app: 'dawlessdaw',
      feature: 'clock-health',
      honesty: 'experimental' as const,
      disclaimer:
        'Passive MIDI clock monitor. Not a clock master. Duplicate-source is a browser-port hint only. Hardware verification required.',
    };
  }
}
