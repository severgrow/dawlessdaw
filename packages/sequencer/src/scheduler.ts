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
const STEPS_PER_BAR = 16;

export type NowFn = () => number;
export type NoteOutFn = (note: SeqScheduledNote) => void;
export type AllNotesOffFn = () => void;
export type PlayheadFn = (step: number) => void;

export interface SchedulerOptions {
  now?: NowFn;
  onNote: NoteOutFn;
  shouldPlayNotes?: () => boolean;
  onAllNotesOff?: AllNotesOffFn;
  onPlayhead?: PlayheadFn;
  onBarBoundary?: () => boolean;
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
  private patternStartStep = 0;
  private internalSteps = 0;
  private lastCircuitTick: number | null = null;
  private circuitTickMs: number | null = null;
  private pattern: SeqPattern | null = null;
  private bpm = 120;
  private clockSource: 'circuit' | 'internal' = 'circuit';
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private lastNoteEndsAt = 0;
  private resumeAt = 0;
  private readonly now: NowFn;
  private readonly onNote: NoteOutFn;
  private readonly shouldPlayNotes?: () => boolean;
  private readonly onAllNotesOff?: AllNotesOffFn;
  private readonly onPlayhead?: PlayheadFn;
  private readonly onBarBoundary?: () => boolean;
  private readonly lookAheadMs: number;
  private readonly intervalMs: number;

  constructor(opts: SchedulerOptions) {
    this.now =
      opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onNote = opts.onNote;
    this.shouldPlayNotes = opts.shouldPlayNotes;
    this.onAllNotesOff = opts.onAllNotesOff;
    this.onPlayhead = opts.onPlayhead;
    this.onBarBoundary = opts.onBarBoundary;
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
      return (Math.floor(this.tickCount / CLOCKS_PER_STEP) - this.patternStartStep) % len;
    }
    return this.lastFiredStep >= 0 ? this.lastFiredStep % len : 0;
  }

  /** Circuit Start — reset and run. Does not emit MIDI clock. */
  onTransportStart(): void {
    if (this.clockSource !== 'circuit') return;
    this.tickCount = 0;
    this.patternStartStep = 0;
    this.lastCircuitTick = null;
    this.circuitTickMs = null;
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
    // Let timestamped releases drain before a new pattern can retrigger a queued note.
    this.resumeAt = this.lastNoteEndsAt;
    this.onAllNotesOff?.();
    this.onPlayhead?.(-1);
  }

  /** One MIDI Timing Clock (0xF8) from Circuit. */
  onClockTick(timestamp?: number): void {
    if (this.clockSource !== 'circuit' || !this.playing || !this.pattern) return;
    const time = timestamp ?? this.now();
    const interval = this.lastCircuitTick == null ? null : time - this.lastCircuitTick;
    this.lastCircuitTick = time;
    if (interval != null && interval >= 6 && interval < 80) {
      this.circuitTickMs = this.circuitTickMs == null ? interval : this.circuitTickMs * 0.8 + interval * 0.2;
    }
    if (time < this.resumeAt) return;
    if (this.tickCount % CLOCKS_PER_STEP === 0) {
      const elapsed = Math.floor(this.tickCount / CLOCKS_PER_STEP);
      if (this.applyBarBoundary(elapsed, time)) this.patternStartStep = elapsed;
      const step = (elapsed - this.patternStartStep) % this.pattern.length;
      this.fireStep(step, time);
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
    this.internalSteps = 0;
    this.nextStepAt = Math.max(this.now(), this.resumeAt);
    this.startInternalLoop();
    this.onPlayhead?.(0);
  }

  /** App STOP (works for both modes from UI). */
  stop(): void {
    this.playing = false;
    this.stopInternalLoop();
    this.tickCount = 0;
    this.patternStartStep = 0;
    this.lastCircuitTick = null;
    this.circuitTickMs = null;
    this.lastFiredStep = -1;
    // Let timestamped releases drain before a new pattern can retrigger a queued note.
    this.resumeAt = this.lastNoteEndsAt;
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
    const horizon = now + this.lookAheadMs;
    let guard = 0;
    while (this.nextStepAt <= horizon && guard++ < 32) {
      const at = Math.max(this.nextStepAt, now);
      if (this.applyBarBoundary(this.internalSteps, at)) this.lastFiredStep = -1;
      const len = this.pattern.length;
      const fireStep = this.lastFiredStep < 0 ? 0 : (this.lastFiredStep + 1) % len;
      this.fireStep(fireStep, at);
      this.lastFiredStep = fireStep;
      this.onPlayhead?.(fireStep);
      this.internalSteps += 1;
      this.nextStepAt = at + stepDurationMs(this.bpm);
    }
  }

  private applyBarBoundary(elapsed: number, time: number): boolean {
    // Existing releases remain ordered before any retrigger from the new take.
    return elapsed % STEPS_PER_BAR === 0 && time >= this.lastNoteEndsAt &&
      (this.onBarBoundary?.() ?? false);
  }

  private fireStep(step: number, time: number): void {
    if (!this.pattern || this.shouldPlayNotes?.() === false) return;
    const len = this.pattern.length;
    if (step < 0 || step >= len) return;
    const audible = audibleTracks(this.pattern);
    const stepMs = this.clockSource === 'circuit' && this.circuitTickMs != null
      ? this.circuitTickMs * CLOCKS_PER_STEP
      : stepDurationMs(this.bpm);
    this.pattern.tracks.forEach((track, i) => {
      if (!audible[i]) return;
      const st = track.steps[step];
      if (!st?.on) return;
      const durationMs = Math.min(stepMs, Math.max(20, st.gate * stepMs));
      this.lastNoteEndsAt = Math.max(this.lastNoteEndsAt, time + durationMs);
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
