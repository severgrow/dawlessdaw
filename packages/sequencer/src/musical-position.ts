/**
 * Shared musical-position model (A3 foundation).
 * Counts Circuit Start/Stop/Continue/Clock; estimates BPM; bar/beat in 4/4.
 * Project Change is informational only — never triggers outbound MIDI here.
 */

import { PPQN } from './scheduler';

/** Clocks per bar in 4/4 (24 PPQN × 4 beats). */
export const CLOCKS_PER_BAR = PPQN * 4;
/** Sixteenth steps per bar. */
export const STEPS_PER_BAR = 16;

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface ProjectChangeInfo {
  program: number;
  index: number;
  kind: 'instant' | 'queued';
  at: number;
}

export interface MusicalPositionSnapshot {
  transport: TransportState;
  tickCount: number;
  /** 1-based bar since last Start (resets on Start). */
  bar: number;
  /** 1–4 beat within bar. */
  beat: number;
  /** 0–15 sixteenth within bar. */
  stepInBar: number;
  bpm: number | null;
  lastProject: ProjectChangeInfo | null;
  honesty: 'experimental';
}

export type PositionListener = () => void;

export class MusicalPositionModel {
  private transport: TransportState = 'stopped';
  private tickCount = 0;
  private bpm: number | null = null;
  private lastProject: ProjectChangeInfo | null = null;
  private clockTickTimes: number[] = [];
  private cached: MusicalPositionSnapshot | null = null;
  private listeners = new Set<PositionListener>();
  private readonly now: () => number;

  constructor(opts?: { now?: () => number }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  subscribe(fn: PositionListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): MusicalPositionSnapshot {
    if (!this.cached) this.cached = this.build();
    return this.cached;
  }

  private build(): MusicalPositionSnapshot {
    const clocksInBar = this.tickCount % CLOCKS_PER_BAR;
    const bar = Math.floor(this.tickCount / CLOCKS_PER_BAR) + 1;
    const beat = Math.floor(clocksInBar / PPQN) + 1;
    const stepInBar = Math.floor(clocksInBar / (PPQN / 4));
    return {
      transport: this.transport,
      tickCount: this.tickCount,
      bar: this.transport === 'stopped' && this.tickCount === 0 ? 0 : bar,
      beat: this.transport === 'stopped' && this.tickCount === 0 ? 0 : beat,
      stepInBar: this.transport === 'stopped' && this.tickCount === 0 ? 0 : stepInBar,
      bpm: this.bpm,
      lastProject: this.lastProject ? { ...this.lastProject } : null,
      honesty: 'experimental',
    };
  }

  reset(): void {
    this.transport = 'stopped';
    this.tickCount = 0;
    this.bpm = null;
    this.lastProject = null;
    this.clockTickTimes = [];
    this.emit();
  }

  onStart(): void {
    this.transport = 'playing';
    this.tickCount = 0;
    this.clockTickTimes = [];
    this.emit();
  }

  onContinue(): void {
    this.transport = 'playing';
    this.emit();
  }

  onStop(): void {
    this.transport = 'stopped';
    this.clockTickTimes = [];
    this.emit();
  }

  onClock(): void {
    if (this.transport !== 'playing') return;
    this.tickCount += 1;
    const t = this.now();
    this.clockTickTimes = [...this.clockTickTimes.slice(-47), t];
    if (this.clockTickTimes.length >= 24) {
      const first = this.clockTickTimes[0]!;
      const last = this.clockTickTimes[this.clockTickTimes.length - 1]!;
      const ticks = this.clockTickTimes.length - 1;
      const msPerTick = (last - first) / ticks;
      const bpm = 60_000 / (msPerTick * PPQN);
      if (Number.isFinite(bpm) && bpm > 20 && bpm < 400) {
        this.bpm = Math.round(bpm * 10) / 10;
      }
    }
    // Always invalidate snapshot so getSnapshot() sees every tick (A3).
    // Throttle listener notify to beat boundaries (every PPQN clocks).
    this.cached = null;
    if (this.tickCount % PPQN === 0) {
      for (const fn of this.listeners) fn();
    }
  }

  /**
   * Program Change on Circuit ch16 — informational only.
   * 0–63 instant project, 64–127 queued.
   */
  onProjectChange(program: number): void {
    const p = program & 0x7f;
    const kind = p >= 64 ? 'queued' : 'instant';
    const index = (p % 64) + 1;
    this.lastProject = { program: p, index, kind, at: this.now() };
    this.emit();
  }
}
