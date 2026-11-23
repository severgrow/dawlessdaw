import {
  activePattern,
  cloneBank,
  clonePattern,
  createBank,
  sanitizeBank,
  setStepParams,
  toggleStep,
} from './pattern';
import { SeqScheduler, type NoteOutFn, type AllNotesOffFn } from './scheduler';
import {
  SEQ_PATTERN_SLOTS,
  SEQ_STEP_COUNT,
  STORAGE_KEY_SEQUENCER,
  type SeqBank,
  type SeqClockSource,
  type SeqEngineSnapshot,
  type SeqPattern,
  type SeqStep,
} from './types';

export type SeqChangeListener = () => void;

export interface SequencerEngineOptions {
  onNote: NoteOutFn;
  onAllNotesOff?: AllNotesOffFn;
  now?: () => number;
  /** Persist bank to localStorage (default true in browser). */
  persist?: boolean;
  storageKey?: string;
}

/**
 * Dawlessdaw-owned 8×16 sequencer — serialisable patterns, undo/redo,
 * Circuit-slaved or internal BPM clock. No React clocks for MIDI out.
 */
export class SequencerEngine {
  private bank: SeqBank;
  private undoStack: SeqPattern[] = [];
  private redoStack: SeqPattern[] = [];
  private recording = false;
  private playhead = -1;
  private liveActivity: SeqEngineSnapshot['liveActivity'] = null;
  private listeners = new Set<SeqChangeListener>();
  private scheduler: SeqScheduler;
  private audition: SeqPattern | null = null;
  private pendingAudition: { pattern: SeqPattern | null } | null = null;
  private circuitPlaybackArmed = false;
  private selectedTrack = 1;
  private selectedStep = 0;
  private readonly persistEnabled: boolean;
  private readonly storageKey: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SequencerEngineOptions) {
    this.persistEnabled = opts.persist !== false && typeof localStorage !== 'undefined';
    this.storageKey = opts.storageKey ?? STORAGE_KEY_SEQUENCER;
    this.bank = this.loadBank() ?? createBank(120);
    this.scheduler = new SeqScheduler({
      now: opts.now,
      onNote: opts.onNote,
      shouldPlayNotes: () => this.bank.clockSource === 'internal' || this.circuitPlaybackArmed,
      onAllNotesOff: opts.onAllNotesOff,
      onBarBoundary: () => this.applyQueuedAudition(),
      onPlayhead: (step) => {
        this.playhead = step;
        this.notifyThrottled();
      },
    });
    this.scheduler.setClockSource(this.bank.clockSource);
    this.scheduler.setPattern(activePattern(this.bank));
  }

  subscribe(fn: SeqChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getSnapshot(): SeqEngineSnapshot {
    return {
      bank: cloneBank(this.bank),
      playing: this.scheduler.isPlaying(),
      recording: this.recording,
      playhead: this.playhead,
      auditionSide: this.audition ? 'A' : 'B',
      queuedAudition: this.pendingAudition ? (this.pendingAudition.pattern ? 'A' : 'B') : null,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      liveActivity: this.liveActivity ? { ...this.liveActivity } : null,
    };
  }

  getSelected(): { track: number; step: number } {
    return { track: this.selectedTrack, step: this.selectedStep };
  }

  selectCell(track: number, step: number): void {
    this.selectedTrack = Math.max(1, Math.min(8, track));
    this.selectedStep = Math.max(0, Math.min(SEQ_STEP_COUNT - 1, step));
    this.notify();
  }

  dispose(): void {
    this.scheduler.dispose();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
  }

  // ─── Transport ───────────────────────────────────────────────

  /** UI Play enables pattern playback on Circuit ticks or starts the internal clock. */
  play(): void {
    if (this.bank.clockSource === 'circuit') this.circuitPlaybackArmed = true;
    if (this.scheduler.isPlaying()) return;
    this.syncSchedulerPattern();
    if (this.bank.clockSource === 'internal') {
      this.scheduler.playInternal();
      this.notify();
      return;
    }
    // The Circuit may already be running. The next clock tick starts the pattern.
    this.scheduler.onTransportStart();
    this.notify();
  }

  stop(): void {
    this.circuitPlaybackArmed = false;
    this.scheduler.stop();
    this.applyQueuedAudition();
    this.recording = false;
    this.playhead = -1;
    this.notify();
  }

  setRecording(on: boolean): void {
    this.recording = on;
    if (on) this.pendingAudition = null;
    if (!on && this.bank.clockSource === 'circuit' && !this.circuitPlaybackArmed &&
        this.scheduler.isPlaying()) {
      this.scheduler.onTransportStop();
    }
    this.notify();
  }

  toggleRecording(): void {
    this.setRecording(!this.recording);
  }

  /** Forward Circuit transport / clock into the scheduler (authority stays Circuit). */
  onMidiClockMessage(kind: string, timestamp?: number): void {
    if (this.bank.clockSource !== 'circuit' || (!this.circuitPlaybackArmed && !this.recording)) return;
    if (kind === 'start') {
      this.scheduler.onTransportStart();
      this.notify();
    } else if (kind === 'continue') {
      this.scheduler.onTransportContinue();
      this.notify();
    } else if (kind === 'stop') {
      this.scheduler.onTransportStop();
      this.applyQueuedAudition();
      this.playhead = -1;
      this.notify();
    } else if (kind === 'clock') {
      this.scheduler.onClockTick(timestamp);
    }
  }

  setClockSource(source: SeqClockSource): void {
    if (this.bank.clockSource === source) return;
    this.circuitPlaybackArmed = false;
    this.scheduler.stop();
    this.applyQueuedAudition();
    this.bank = { ...this.bank, clockSource: source };
    this.scheduler.setClockSource(source);
    this.persistSoon();
    this.notify();
  }

  /** A is a playback override. The bank and its edit history always belong to B. */
  setAuditionPattern(pattern: SeqPattern | null): boolean {
    this.pendingAudition = null;
    if (pattern === this.audition) return false;
    const wasPlaying = this.scheduler.isPlaying();
    this.pauseForAudition();
    this.audition = pattern;
    this.syncSchedulerPattern();
    return wasPlaying;
  }

  requestAudition(pattern: SeqPattern | null): void {
    if (!this.scheduler.isPlaying() || this.recording) {
      this.setAuditionPattern(pattern);
    } else {
      const sameSide = Boolean(pattern) === Boolean(this.audition);
      this.pendingAudition = sameSide ? null : { pattern };
    }
    this.notify();
  }

  private applyQueuedAudition(): boolean {
    if (!this.pendingAudition) return false;
    this.audition = this.pendingAudition.pattern;
    this.pendingAudition = null;
    this.syncSchedulerPattern();
    return true;
  }

  pauseForAudition(): void {
    this.circuitPlaybackArmed = false;
    this.pendingAudition = null;
    if (this.scheduler.isPlaying() || this.recording) this.stop();
  }

  // ─── Pattern edits ───────────────────────────────────────────

  setActivePattern(index: number): void {
    const i = Math.max(0, Math.min(SEQ_PATTERN_SLOTS - 1, index));
    if (i === this.bank.activePatternIndex) return;
    this.bank = { ...this.bank, activePatternIndex: i };
    this.undoStack = [];
    this.redoStack = [];
    this.syncSchedulerPattern();
    this.persistSoon();
    this.notify();
  }

  setLength(length: number): void {
    this.mutatePattern((p) => ({
      ...clonePattern(p),
      length: Math.max(1, Math.min(SEQ_STEP_COUNT, Math.round(length))),
    }));
  }

  setBpm(bpm: number): void {
    const v = Math.max(40, Math.min(300, Math.round(bpm)));
    this.mutatePattern((p) => ({ ...clonePattern(p), bpm: v }), false);
    this.persistSoon();
    this.notify();
  }

  clickToggle(track: number, step: number): void {
    this.selectCell(track, step);
    this.mutatePattern((p) => toggleStep(p, track, step));
  }

  setStep(track: number, step: number, patch: Partial<Pick<SeqStep, 'pitch' | 'velocity' | 'gate' | 'on'>>): void {
    this.selectCell(track, step);
    this.mutatePattern((p) => setStepParams(p, track, step, patch));
  }

  setTrackMute(track: number, muted: boolean): void {
    this.mutatePattern((p) => {
      const next = clonePattern(p);
      const t = next.tracks[track - 1];
      if (t) t.muted = muted;
      return next;
    });
  }

  setTrackSolo(track: number, solo: boolean): void {
    this.mutatePattern((p) => {
      const next = clonePattern(p);
      const t = next.tracks[track - 1];
      if (t) t.solo = solo;
      return next;
    });
  }

  setTrackDefaults(
    track: number,
    patch: Partial<{ defaultPitch: number; defaultVelocity: number; defaultGate: number }>,
  ): void {
    this.mutatePattern((p) => {
      const next = clonePattern(p);
      const t = next.tracks[track - 1];
      if (!t) return p;
      if (patch.defaultPitch !== undefined) t.defaultPitch = patch.defaultPitch;
      if (patch.defaultVelocity !== undefined) t.defaultVelocity = patch.defaultVelocity;
      if (patch.defaultGate !== undefined) t.defaultGate = patch.defaultGate;
      return next;
    });
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    const cur = activePattern(this.bank);
    this.redoStack.push(clonePattern(cur));
    this.replaceActive(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    const cur = activePattern(this.bank);
    this.undoStack.push(clonePattern(cur));
    this.replaceActive(next);
  }

  /**
   * Optional monitor / record: Circuit notes observed on track channels 1–8.
   * Does not claim these are Circuit's stored pattern steps.
   */
  observeCircuitNote(track: number, note: number, velocity: number): void {
    if (track < 1 || track > 8) return;
    const at = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.liveActivity = { track, note, velocity, at };
    if (this.recording && this.scheduler.isPlaying() && this.playhead >= 0) {
      this.mutatePattern((p) => {
        const next = clonePattern(p);
        const st = next.tracks[track - 1]?.steps[this.playhead];
        if (!st) return p;
        st.on = true;
        st.pitch = note;
        st.velocity = Math.max(1, Math.min(127, velocity));
        return next;
      });
    } else {
      this.notifyThrottled();
    }
  }

  replaceBank(bank: SeqBank): void {
    this.scheduler.stop();
    this.applyQueuedAudition();
    this.bank = sanitizeBank(bank) ?? createBank();
    this.undoStack = [];
    this.redoStack = [];
    this.scheduler.setClockSource(this.bank.clockSource);
    this.syncSchedulerPattern();
    this.persistSoon();
    this.notify();
  }

  /**
   * Replace the active pattern (e.g. generative working → sequencer).
   * Optionally push undo. Does not change bank slot index.
   */
  replaceActivePattern(pattern: SeqPattern, pushUndo = true): void {
    this.mutatePattern(() => clonePattern(pattern), pushUndo);
  }

  // ─── internals ───────────────────────────────────────────────

  private mutatePattern(fn: (p: SeqPattern) => SeqPattern, pushUndo = true): void {
    const cur = activePattern(this.bank);
    const next = fn(cur);
    if (JSON.stringify(cur) === JSON.stringify(next)) return;
    if (pushUndo) {
      this.undoStack = [...this.undoStack.slice(-39), clonePattern(cur)];
      this.redoStack = [];
    }
    this.replaceActive(next);
  }

  private replaceActive(pattern: SeqPattern): void {
    const patterns = this.bank.patterns.map((p, i) =>
      i === this.bank.activePatternIndex ? pattern : p,
    );
    this.bank = { ...this.bank, patterns };
    this.syncSchedulerPattern();
    this.persistSoon();
    this.notify();
  }

  private syncSchedulerPattern(): void {
    this.scheduler.setPattern(this.audition ?? activePattern(this.bank));
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private notifyThrottled(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.notify();
    }, 50);
  }

  private persistSoon(): void {
    if (!this.persistEnabled) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.bank));
      } catch {
        // storage full / blocked
      }
    }, 200);
  }

  private loadBank(): SeqBank | null {
    if (!this.persistEnabled) return null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      return sanitizeBank(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
