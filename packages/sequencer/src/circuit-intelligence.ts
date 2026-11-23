/**
 * Circuit Intelligence (Milestone 1) — passive inference from Circuit **input** MIDI.
 *
 * - Last-touched track from macro CC 21–28 (selected-track detector)
 * - Pattern activity labels (cautious; never mutes hardware)
 * - Shared musical position + musical-event log foundation
 *
 * Analysis only — never emits MIDI, never changes routing. Keep off the critical path:
 * callers should invoke after routing decisions, not between note-in and note-out.
 */

import { MusicalEventLog, type MusicalEvent, type MusicalEventConfidence } from './musical-events';
import {
  CLOCKS_PER_BAR,
  MusicalPositionModel,
  type MusicalPositionSnapshot,
} from './musical-position';
import { CLOCKS_PER_STEP, PPQN } from './scheduler';

export const INTEL_TRACK_COUNT = 8 as const;
export const INTEL_STEP_COUNT = 16 as const;

/** Circuit Rhythm macro knobs — same as devices CIRCUIT_MACRO_CCS. */
export const INTEL_MACRO_CCS = [21, 22, 23, 24, 25, 26, 27, 28] as const;

export type TrackActivityLabel =
  | 'Active'
  | 'Silent'
  | 'Possible mute'
  | 'Possible pattern change'
  | 'Unknown';

export type ConfidenceLabel = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface LastTouchedSnapshot {
  track: number | null;
  knob: number | null;
  cc: number | null;
  at: number | null;
  confidence: ConfidenceLabel;
  /** How we know (plain English). */
  reason: string;
}

export interface TrackActivitySnapshot {
  track: number;
  label: TrackActivityLabel;
  confidence: ConfidenceLabel;
  /** Learned “normally plays” after enough loops. */
  learned: boolean;
  hitsThisCycle: number;
  hitsBaseline: number;
  reason: string;
}

export interface CircuitIntelligenceSnapshot {
  honesty: 'experimental';
  position: MusicalPositionSnapshot;
  lastTouched: LastTouchedSnapshot;
  tracks: TrackActivitySnapshot[];
  /** Newest-first musical events (bounded). */
  events: readonly MusicalEvent[];
  autoFocus: boolean;
  listening: true;
}

export type IntelListener = () => void;

function emptyFingerprint(): boolean[] {
  return Array.from({ length: INTEL_STEP_COUNT }, () => false);
}

function cloneFp(fp: boolean[]): boolean[] {
  return fp.slice();
}

function fpPopcount(fp: boolean[]): number {
  let n = 0;
  for (const v of fp) if (v) n += 1;
  return n;
}

/** Jaccard distance on step sets; 0 = identical, 1 = disjoint. */
function fpDistance(a: boolean[], b: boolean[]): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < INTEL_STEP_COUNT; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x || y) union += 1;
    if (x && y) inter += 1;
  }
  if (union === 0) return 0;
  return 1 - inter / union;
}

interface TrackState {
  hitThisCycle: boolean[];
  /** Running OR of recent “active” cycles — soft baseline. */
  baseline: boolean[];
  learnedCycles: number;
  label: TrackActivityLabel;
  confidence: ConfidenceLabel;
  reason: string;
}

function freshTrack(t: number): TrackState {
  return {
    hitThisCycle: emptyFingerprint(),
    baseline: emptyFingerprint(),
    learnedCycles: 0,
    label: 'Unknown',
    confidence: 'Unknown',
    reason: `T${t}: not enough loops yet`,
  };
}

const LEARN_CYCLES = 2;
/** Fingerprint distance above this → Possible pattern change. */
const PATTERN_CHANGE_DISTANCE = 0.45;
/** Soften confidence on last-touched after this many ms. */
const TOUCH_HIGH_MS = 4_000;
const TOUCH_MED_MS = 20_000;

/**
 * Passive Circuit Intelligence engine.
 * Call only with messages from Circuit MIDI **input**.
 */
export class CircuitIntelligenceEngine {
  private position: MusicalPositionModel;
  private events = new MusicalEventLog({ limit: 200 });
  private tracks: TrackState[] = Array.from({ length: INTEL_TRACK_COUNT }, (_, i) =>
    freshTrack(i + 1),
  );
  private lastTouched: LastTouchedSnapshot = {
    track: null,
    knob: null,
    cc: null,
    at: null,
    confidence: 'Unknown',
    reason: 'No macro twist heard yet',
  };
  private autoFocus = true;
  private playing = false;
  private tickCount = 0;
  private loopLength = INTEL_STEP_COUNT;
  private cached: CircuitIntelligenceSnapshot | null = null;
  private listeners = new Set<IntelListener>();
  private readonly now: () => number;
  private unsubs: Array<() => void> = [];

  constructor(opts?: { now?: () => number; autoFocus?: boolean }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.position = new MusicalPositionModel({ now: this.now });
    if (opts?.autoFocus != null) this.autoFocus = opts.autoFocus;
    this.unsubs.push(
      this.position.subscribe(() => this.invalidate()),
      this.events.subscribe(() => this.invalidate()),
    );
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  subscribe(fn: IntelListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private invalidate(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): CircuitIntelligenceSnapshot {
    if (!this.cached) this.cached = this.build();
    return this.cached;
  }

  private build(): CircuitIntelligenceSnapshot {
    const now = this.now();
    const lastTouched = this.refreshTouchConfidence(now);
    return {
      honesty: 'experimental',
      position: this.position.getSnapshot(),
      lastTouched,
      tracks: this.tracks.map((st, i) => ({
        track: i + 1,
        label: st.label,
        confidence: st.confidence,
        learned: st.learnedCycles >= LEARN_CYCLES,
        hitsThisCycle: fpPopcount(st.hitThisCycle),
        hitsBaseline: fpPopcount(st.baseline),
        reason: st.reason,
      })),
      events: this.events.getSnapshot(),
      autoFocus: this.autoFocus,
      listening: true,
    };
  }

  private refreshTouchConfidence(now: number): LastTouchedSnapshot {
    if (this.lastTouched.at == null) return { ...this.lastTouched };
    const age = now - this.lastTouched.at;
    let confidence: ConfidenceLabel = 'High';
    if (age > TOUCH_MED_MS) confidence = 'Low';
    else if (age > TOUCH_HIGH_MS) confidence = 'Medium';
    return { ...this.lastTouched, confidence };
  }

  setAutoFocus(on: boolean): void {
    this.autoFocus = on;
    this.events.append({
      kind: 'marker',
      at: this.now(),
      confidence: 'high',
      honesty: 'experimental',
      data: { autoFocus: on },
      summary: `Auto-focus ${on ? 'on' : 'off'}`,
    });
    this.invalidate();
  }

  getAutoFocus(): boolean {
    return this.autoFocus;
  }

  reset(): void {
    this.position.reset();
    this.events.clear();
    this.tracks = Array.from({ length: INTEL_TRACK_COUNT }, (_, i) => freshTrack(i + 1));
    this.lastTouched = {
      track: null,
      knob: null,
      cc: null,
      at: null,
      confidence: 'Unknown',
      reason: 'No macro twist heard yet',
    };
    this.playing = false;
    this.tickCount = 0;
    this.invalidate();
  }

  onTransportStart(): void {
    this.playing = true;
    this.tickCount = 0;
    for (const st of this.tracks) st.hitThisCycle = emptyFingerprint();
    this.position.onStart();
    this.events.append({
      kind: 'transport-start',
      at: this.now(),
      confidence: 'high',
      honesty: 'experimental',
      data: {},
      summary: 'Transport Start',
    });
    this.invalidate();
  }

  onTransportContinue(): void {
    this.playing = true;
    this.position.onContinue();
    this.events.append({
      kind: 'transport-continue',
      at: this.now(),
      confidence: 'high',
      honesty: 'experimental',
      data: {},
      summary: 'Transport Continue',
    });
    this.invalidate();
  }

  onTransportStop(): void {
    this.playing = false;
    this.position.onStop();
    this.events.append({
      kind: 'transport-stop',
      at: this.now(),
      confidence: 'high',
      honesty: 'experimental',
      data: {},
      summary: 'Transport Stop',
    });
    this.invalidate();
  }

  onClock(): void {
    if (!this.playing) return;
    this.tickCount += 1;
    this.position.onClock();
    const clocksPerLoop = this.loopLength * CLOCKS_PER_STEP;
    if (this.tickCount > 0 && this.tickCount % clocksPerLoop === 0) {
      this.endCycle();
    } else if (this.tickCount % PPQN === 0) {
      const pos = this.position.getSnapshot();
      if (pos.beat === 1 && this.tickCount % CLOCKS_PER_BAR === 0) {
        this.events.append({
          kind: 'bar',
          at: this.now(),
          confidence: 'high',
          honesty: 'experimental',
          data: { bar: pos.bar, bpm: pos.bpm },
          summary: `Bar ${pos.bar}${pos.bpm != null ? ` · ≈${pos.bpm} BPM` : ''}`,
        });
      }
      this.invalidate();
    }
  }

  private endCycle(): void {
    for (let i = 0; i < INTEL_TRACK_COUNT; i++) {
      this.classifyTrack(i);
    }
    this.invalidate();
  }

  private classifyTrack(ti: number): void {
    const t = ti + 1;
    const st = this.tracks[ti]!;
    const hits = fpPopcount(st.hitThisCycle);
    const baseHits = fpPopcount(st.baseline);
    const learned = st.learnedCycles >= LEARN_CYCLES;
    const cycleFp = cloneFp(st.hitThisCycle);

    if (hits > 0) {
      if (learned && baseHits >= 2) {
        const dist = fpDistance(cycleFp, st.baseline);
        if (dist >= PATTERN_CHANGE_DISTANCE) {
          st.label = 'Possible pattern change';
          st.confidence = 'Low';
          st.reason = `T${t}: step pattern shifted vs learned loops (guess — confirm on Circuit)`;
          this.events.append({
            kind: 'pattern-hint',
            at: this.now(),
            confidence: 'low',
            honesty: 'experimental',
            data: { track: t, label: st.label, distance: dist },
            summary: `T${t}: Possible pattern change`,
          });
          // Reset baseline toward the new shape so we re-learn.
          st.baseline = cycleFp;
          st.learnedCycles = 1;
        } else {
          st.label = 'Active';
          st.confidence = 'High';
          st.reason = `T${t}: notes this loop`;
          for (let s = 0; s < INTEL_STEP_COUNT; s++) {
            if (cycleFp[s]) st.baseline[s] = true;
          }
          st.learnedCycles += 1;
        }
      } else {
        for (let s = 0; s < INTEL_STEP_COUNT; s++) {
          if (cycleFp[s]) st.baseline[s] = true;
        }
        st.learnedCycles += 1;
        st.label = 'Active';
        st.confidence = st.learnedCycles >= LEARN_CYCLES ? 'High' : 'Medium';
        st.reason =
          st.learnedCycles >= LEARN_CYCLES
            ? `T${t}: notes this loop`
            : `T${t}: learning (${st.learnedCycles}/${LEARN_CYCLES} loops)`;
      }
    } else if (!learned) {
      st.label = 'Unknown';
      st.confidence = 'Unknown';
      st.reason = `T${t}: silent — not enough loops to guess`;
    } else if (baseHits === 0) {
      st.label = 'Silent';
      st.confidence = 'Medium';
      st.reason = `T${t}: no notes across learned loops`;
    } else {
      st.label = 'Possible mute';
      st.confidence = 'Low';
      st.reason = `T${t}: normally plays, silent this loop — Possible mute (never auto-muted)`;
      this.events.append({
        kind: 'track-activity',
        at: this.now(),
        confidence: 'low',
        honesty: 'experimental',
        data: { track: t, label: st.label },
        summary: `T${t}: Possible mute`,
      });
    }

    st.hitThisCycle = emptyFingerprint();
  }

  /**
   * Note-on from Circuit input (channel 1–8 → track).
   * Used for activity fingerprints only — does not change routing.
   */
  onNoteOn(channel: number, _note: number, velocity: number): void {
    if (!this.playing) return;
    if (channel < 1 || channel > INTEL_TRACK_COUNT) return;
    if (velocity <= 0) return;
    const ti = channel - 1;
    const step = Math.floor(this.tickCount / CLOCKS_PER_STEP) % this.loopLength;
    this.tracks[ti]!.hitThisCycle[step] = true;
    // Live label while playing — Active with medium confidence mid-cycle.
    const st = this.tracks[ti]!;
    if (st.label !== 'Active') {
      st.label = 'Active';
      st.confidence = st.learnedCycles >= LEARN_CYCLES ? 'High' : 'Medium';
      st.reason = `T${channel}: note heard this loop`;
      this.invalidate();
    }
  }

  /**
   * Macro CC 21–28 on track channel → last-touched (selected track).
   * Returns whether auto-focus should update UI selection (caller decides).
   */
  onMacroCc(
    channel: number,
    controller: number,
    _value: number,
  ): { track: number; knob: number; shouldAutoFocus: boolean } | null {
    const knob = INTEL_MACRO_CCS.indexOf(controller as (typeof INTEL_MACRO_CCS)[number]);
    if (knob < 0) return null;
    if (channel < 1 || channel > INTEL_TRACK_COUNT) return null;
    const at = this.now();
    const confidence: ConfidenceLabel = 'High';
    this.lastTouched = {
      track: channel,
      knob,
      cc: controller,
      at,
      confidence,
      reason: `Macro ${knob + 1} (CC ${controller}) on T${channel} — Circuit selected track`,
    };
    const conf: MusicalEventConfidence = 'high';
    this.events.append({
      kind: 'last-touched',
      at,
      confidence: conf,
      honesty: 'experimental',
      data: { track: channel, knob, cc: controller },
      summary: `Last-touched T${channel} · knob ${knob + 1}`,
    });
    this.invalidate();
    return { track: channel, knob, shouldAutoFocus: this.autoFocus };
  }

  onProjectChange(program: number): void {
    this.position.onProjectChange(program);
    const pos = this.position.getSnapshot();
    const info = pos.lastProject;
    this.events.append({
      kind: 'project-change',
      at: this.now(),
      confidence: 'high',
      honesty: 'experimental',
      data: info ? { ...info } : { program },
      summary: info
        ? `Project ${info.index} (${info.kind}) — informational`
        : `Project PC ${program}`,
    });
    this.invalidate();
  }

  /** Convenience for raw kind strings from StudioRuntime clock bus. */
  onMidiTransport(kind: string): void {
    if (kind === 'clock') this.onClock();
    else if (kind === 'start') this.onTransportStart();
    else if (kind === 'continue') this.onTransportContinue();
    else if (kind === 'stop') this.onTransportStop();
  }

  exportDiagnostic(): Record<string, unknown> {
    const snap = this.getSnapshot();
    return {
      exportedAt: new Date().toISOString(),
      app: 'dawlessdaw',
      feature: 'circuit-intelligence',
      honesty: 'experimental',
      disclaimer:
        'Passive inference from Circuit USB MIDI. Labels are guesses — never auto-mute hardware. Confirm on device before trusting.',
      position: snap.position,
      lastTouched: snap.lastTouched,
      tracks: snap.tracks,
      autoFocus: snap.autoFocus,
      events: this.events.exportEvents().slice(0, 50),
      ppqn: PPQN,
      clocksPerStep: CLOCKS_PER_STEP,
    };
  }
}

export function confidenceToCss(c: ConfidenceLabel): string {
  switch (c) {
    case 'High':
      return 'ci-conf-high';
    case 'Medium':
      return 'ci-conf-med';
    case 'Low':
      return 'ci-conf-low';
    default:
      return 'ci-conf-unknown';
  }
}

export function activityToCss(label: TrackActivityLabel): string {
  switch (label) {
    case 'Active':
      return 'ci-act-active';
    case 'Silent':
      return 'ci-act-silent';
    case 'Possible mute':
      return 'ci-act-mute';
    case 'Possible pattern change':
      return 'ci-act-pattern';
    default:
      return 'ci-act-unknown';
  }
}
