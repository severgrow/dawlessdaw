/**
 * Timestamped MIDI note scheduler for the Dawlessdaw sequencer.
 *
 * Honesty: runs on the browser main thread. Uses performance.now() + optional
 * Web MIDI output timestamps. Not sample-accurate; expect jitter vs DIN thru.
 * Never emits MIDI clock — Circuit remains the studio clock master by default.
 */

import type { SeqPattern, SeqScheduledNote } from './types';
import { audibleTracks } from './pattern';

/** MIDI clocks per quarter note */
export const PPQN = 24;
/** Sixteenth-note steps: 24/4 = 6 clocks per step */
export const CLOCKS_PER_STEP = 6;

export type NowFn = () => number;
export type NoteOutFn = (note: SeqScheduledNote) => void;
export type AllNotesOffFn = () => void;
export type PlayheadFn = (step: number) => void;

export interface SchedulerOptions {
  now?: NowFn;
  onNote: NoteOutFn;
  onAllNotesOff?: AllNotesOffFn;
  onPlayhead?: PlayheadFn;
  /** Look-ahead window for internal clock (ms) */
  lookAheadMs?: number;
  /** Internal scheduler tick interval (ms) */
  intervalMs?: number;
}

/**
 * Dual-mode clock (Circuit ticks vs internal BPM).
 * React must not drive MIDI out; UI only reads playhead via onPlayhead.
 */
export class SeqScheduler {
  private playing = false;
  private tickCount = 0;
  private lastFiredStep = -1;
  private pattern: SeqPattern | null = null;
  private bpm = 120;
  private clockSource: 'circuit' | 'internal' = 'circuit';
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private readonly now: NowFn;
  private readonly onNote: NoteOutFn;
  private readonly onAllNotesOff?: AllNotesOffFn;
  private readonly onPlayhead?: PlayheadFn;
  private readonly lookAheadMs: number;
  private readonly intervalMs: number;

  constructor(opts: SchedulerOptions) {
    this.now =
      opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onNote = opts.onNote;
    this.onAllNotesOff = opts.onAllNotesOff;
    this.onPlayhead = opts.onPlayhead;
    this.lookAheadMs = opts.lookAheadMs ?? 40;
    this.intervalMs = opts.intervalMs ?? 20;
  }

  setPattern(pattern: SeqPattern): void {
    this.pattern = pattern;
    this.bpm = pattern.bpm;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(300, bpm));
  }

  setClockSource(source: 'circuit' | 'internal'): void {
    const was = this.clockSource;
    this.clockSource = source;
    if (this.playing) {
      if (source === 'internal' && was !== 'internal') this.startInternalLoop();
      if (source === 'circuit' && was === 'internal') this.stopInternalLoop();
    }
  }

  getClockSource(): 'circuit' | 'internal' {
    return this.clockSource;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getPlayhead(): number {
    if (!this.playing || !this.pattern) return -1;
    const len = this.pattern.length;
    if (this.clockSource === 'circuit') {
      return Math.floor(this.tickCount / CLOCKS_PER_STEP) % len;
    }
    return this.lastFiredStep >= 0 ? this.lastFiredStep % len : 0;
  }

  /** Circuit Start — reset and run. Does not emit MIDI clock. */
  onTransportStart(): void {
    if (this.clockSource !== 'circuit') return;
    this.tickCount = 0;
    this.lastFiredStep = -1;
    this.playing = true;
    this.onPlayhead?.(0);
  }

  /** Circuit Continue — resume without reset. */
  onTransportContinue(): void {
    if (this.clockSource !== 'circuit') return;
    this.playing = true;
    this.onPlayhead?.(this.getPlayhead());
  }

  /** Circuit Stop. */
  onTransportStop(): void {
    if (this.clockSource !== 'circuit') return;
    this.playing = false;
    this.lastFiredStep = -1;
    this.onAllNotesOff?.();
    this.onPlayhead?.(-1);
  }

  /** One MIDI Timing Clock (0xF8) from Circuit. */
  onClockTick(timestamp?: number): void {
    if (this.clockSource !== 'circuit' || !this.playing || !this.pattern) return;
    const within = this.tickCount % CLOCKS_PER_STEP;
    if (within === 0) {
      const len = this.pattern.length;
      const step = Math.floor(this.tickCount / CLOCKS_PER_STEP) % len;
      const t = timestamp ?? this.now();
      this.fireStep(step, t);
      this.lastFiredStep = step;
      this.onPlayhead?.(step);
    }
    this.tickCount += 1;
  }

  /** App PLAY when clockSource === 'internal'. */
  playInternal(): void {
    if (this.clockSource !== 'internal') return;
    this.playing = true;
    this.lastFiredStep = -1;
    this.nextStepAt = this.now();
    this.startInternalLoop();
    this.onPlayhead?.(0);
  }

  /** App STOP (works for both modes from UI). */
  stop(): void {
    this.playing = false;
    this.stopInternalLoop();
    this.tickCount = 0;
    this.lastFiredStep = -1;
    this.onAllNotesOff?.();
    this.onPlayhead?.(-1);
  }

  dispose(): void {
    this.stop();
  }

  private startInternalLoop(): void {
    this.stopInternalLoop();
    this.timer = setInterval(() => this.internalTick(), this.intervalMs);
  }

  private stopInternalLoop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private internalTick(): void {
    if (!this.playing || !this.pattern || this.clockSource !== 'internal') return;
    const now = this.now();
    const stepMs = stepDurationMs(this.bpm);
    const horizon = now + this.lookAheadMs;
    let guard = 0;
    while (this.nextStepAt <= horizon && guard++ < 32) {
      const len = this.pattern.length;
      const fireStep = this.lastFiredStep < 0 ? 0 : (this.lastFiredStep + 1) % len;
      const at = Math.max(this.nextStepAt, now);
      this.fireStep(fireStep, at);
      this.lastFiredStep = fireStep;
      this.onPlayhead?.(fireStep);
      this.nextStepAt = at + stepMs;
    }
  }

  private fireStep(step: number, time: number): void {
    if (!this.pattern) return;
    const len = this.pattern.length;
    if (step < 0 || step >= len) return;
    const audible = audibleTracks(this.pattern);
    const stepMs = stepDurationMs(this.bpm);
    this.pattern.tracks.forEach((track, i) => {
      if (!audible[i]) return;
      const st = track.steps[step];
      if (!st?.on) return;
      const durationMs = Math.max(20, st.gate * stepMs);
      this.onNote({
        track: i + 1,
        pitch: st.pitch,
        velocity: st.velocity,
        time,
        durationMs,
        step,
      });
    });
  }
}

/** Step duration in ms at BPM (sixteenth notes). */
export function stepDurationMs(bpm: number): number {
  return (60_000 / Math.max(40, bpm)) / 4;
}
