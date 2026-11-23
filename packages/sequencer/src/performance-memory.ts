/**
 * Performance Memory (Milestone 4) — session event timeline + auto markers.
 *
 * Captures observations while audio is recording (transport, bar/beat, project
 * changes, track activity, macros, morphs, FLIP, pattern hints). Auto musical
 * markers are optional annotations; inferred events are clearly labelled.
 *
 * Analysis only: never sends MIDI. Section Bridge event-actions stay opt-in
 * and never fire from inference.
 */

import {
  MusicalEventLog,
  type MusicalEvent,
  type MusicalEventConfidence,
  type MusicalEventKind,
} from './musical-events';

export type PerformanceMarkerSource =
  | 'manual'
  | 'circuit-project'
  | 'transport'
  | 'inferred'
  | 'macro'
  | 'morph'
  | 'flip';

export interface PerformanceMarker {
  id: string;
  /** Sample index (frames) from take start */
  sample: number;
  /** Seconds from take start */
  seconds: number;
  label: string;
  source: PerformanceMarkerSource;
  /** true = guess / inference — never drives hardware fills */
  inferred: boolean;
  /** Linked timeline event id when auto-created */
  eventId: string | null;
}

export interface PerformanceTimelineEvent {
  id: string;
  kind: MusicalEventKind;
  /** performance.now() when observed */
  atMs: number;
  /** ms from take start */
  relativeMs: number;
  sample: number;
  seconds: number;
  summary: string;
  confidence: MusicalEventConfidence;
  /** true = probable / inferred (not confirmed hardware observation) */
  inferred: boolean;
  honesty: 'experimental' | 'untested' | 'verified';
  data: Record<string, unknown>;
  markerId: string | null;
}

export interface PerformanceMemoryPrefs {
  /**
   * When true, confirmed project-change markers may optionally run Section Bridge
   * outbound (user-triggered replay). Default **false**.
   * Inferred events (pattern-hint, possible mute, etc.) never auto-fill SP/MPC.
   */
  sectionEventActionsEnabled: boolean;
}

export const DEFAULT_PERF_MEMORY_PREFS: PerformanceMemoryPrefs = {
  sectionEventActionsEnabled: false,
};

export interface PerformanceMemorySnapshot {
  honesty: 'experimental';
  active: boolean;
  events: readonly PerformanceTimelineEvent[];
  markers: readonly PerformanceMarker[];
  prefs: PerformanceMemoryPrefs;
  startedAtMs: number | null;
}

type Listener = () => void;

const TIMELINE_LIMIT = 2000;

/** Kinds that also get an auto musical marker on the waveform. */
const AUTO_MARKER_KINDS = new Set<MusicalEventKind>([
  'transport-start',
  'transport-stop',
  'project-change',
  'pattern-hint',
  'morph',
  'flip',
  'marker',
]);

const INFERRED_KINDS = new Set<MusicalEventKind>(['pattern-hint', 'track-activity']);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function markerSourceFor(kind: MusicalEventKind, inferred: boolean): PerformanceMarkerSource {
  if (kind === 'project-change') return 'circuit-project';
  if (kind === 'transport-start' || kind === 'transport-stop' || kind === 'transport-continue')
    return 'transport';
  if (kind === 'morph') return 'morph';
  if (kind === 'flip') return 'flip';
  if (kind === 'macro' || kind === 'last-touched') return 'macro';
  if (inferred || kind === 'pattern-hint' || kind === 'track-activity') return 'inferred';
  if (kind === 'marker') return 'manual';
  return 'inferred';
}

function markerLabelFor(ev: Pick<PerformanceTimelineEvent, 'kind' | 'summary' | 'inferred'>): string {
  if (ev.inferred) return `inferred: ${ev.summary}`;
  return ev.summary;
}

/**
 * Performance Memory session binder — call start() when capture begins,
 * ingest MusicalEvents / macros / morphs / FLIP while recording, stop() on end.
 */
export class PerformanceMemoryEngine {
  private active = false;
  private startedAtMs: number | null = null;
  private sampleRate = 48000;
  private getFrames: () => number = () => 0;
  private events: PerformanceTimelineEvent[] = [];
  private markers: PerformanceMarker[] = [];
  private prefs: PerformanceMemoryPrefs = { ...DEFAULT_PERF_MEMORY_PREFS };
  private seenMusicalIds = new Set<number>();
  private cached: PerformanceMemorySnapshot | null = null;
  private listeners = new Set<Listener>();
  private readonly now: () => number;
  /** Live ring for diagnostics when not recording. */
  private liveLog = new MusicalEventLog({ limit: 64 });

  constructor(opts?: { now?: () => number }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): PerformanceMemorySnapshot {
    if (!this.cached) {
      this.cached = {
        honesty: 'experimental',
        active: this.active,
        events: this.events.slice(),
        markers: this.markers.slice(),
        prefs: { ...this.prefs },
        startedAtMs: this.startedAtMs,
      };
    }
    return this.cached;
  }

  setPrefs(patch: Partial<PerformanceMemoryPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    this.emit();
  }

  getPrefs(): PerformanceMemoryPrefs {
    return { ...this.prefs };
  }

  /**
   * Begin a capture-bound timeline. getFrames() must return current recorded frames.
   */
  start(opts: { sampleRate: number; getFrames: () => number; atMs?: number }): void {
    this.active = true;
    this.sampleRate = opts.sampleRate > 0 ? opts.sampleRate : 48000;
    this.getFrames = opts.getFrames;
    this.startedAtMs = opts.atMs ?? this.now();
    this.events = [];
    this.markers = [];
    this.seenMusicalIds.clear();
    this.emit();
  }

  /**
   * End capture; returns serialisable timeline + markers for TakeMeta.
   * Leaves snapshot readable until next start().
   */
  stop(): { events: PerformanceTimelineEvent[]; markers: PerformanceMarker[] } {
    this.active = false;
    const out = {
      events: this.events.map((e) => ({ ...e, data: { ...e.data } })),
      markers: this.markers.map((m) => ({ ...m })),
    };
    this.emit();
    return out;
  }

  isActive(): boolean {
    return this.active;
  }

  private position(): { sample: number; seconds: number; relativeMs: number; atMs: number } {
    const atMs = this.now();
    const sample = Math.max(0, Math.floor(this.getFrames()));
    const seconds = sample / this.sampleRate;
    const relativeMs =
      this.startedAtMs != null ? Math.max(0, atMs - this.startedAtMs) : seconds * 1000;
    return { sample, seconds, relativeMs, atMs };
  }

  /**
   * Ingest a MusicalEvent from Circuit Intelligence (or sibling sources).
   * Dedupes by MusicalEvent.id within a session.
   */
  ingestMusicalEvent(ev: MusicalEvent): PerformanceTimelineEvent | null {
    this.liveLog.append(ev);
    if (!this.active) return null;
    if (this.seenMusicalIds.has(ev.id)) return null;
    this.seenMusicalIds.add(ev.id);

    // Skip high-rate bar ticks for auto-markers; keep sparse bars (beat 1 only already).
    // Still record bars on the timeline for navigation.
    const inferred = INFERRED_KINDS.has(ev.kind) || ev.confidence === 'low';
    return this.pushEvent({
      kind: ev.kind,
      summary: ev.summary,
      confidence: ev.confidence,
      inferred,
      honesty: ev.honesty,
      data: { ...ev.data },
      makeMarker: AUTO_MARKER_KINDS.has(ev.kind) && ev.kind !== 'bar',
    });
  }

  /** Ingest many events (newest-first log): only unseen ids. */
  ingestMusicalEvents(events: readonly MusicalEvent[]): PerformanceTimelineEvent[] {
    const added: PerformanceTimelineEvent[] = [];
    // Process oldest first so timeline order is chronological.
    for (const ev of [...events].reverse()) {
      const row = this.ingestMusicalEvent(ev);
      if (row) added.push(row);
    }
    return added;
  }

  recordMacro(opts: {
    track: number;
    knob: number;
    cc: number;
    value: number;
    summary?: string;
  }): PerformanceTimelineEvent | null {
    if (!this.active) return null;
    return this.pushEvent({
      kind: 'macro',
      summary: opts.summary ?? `Macro T${opts.track} knob ${opts.knob + 1} → ${opts.value}`,
      confidence: 'high',
      inferred: false,
      honesty: 'experimental',
      data: { ...opts },
      makeMarker: false,
    });
  }

  recordMorph(opts: {
    phase: 'start' | 'end' | 'cancel';
    to?: 'a' | 'b';
    summary?: string;
  }): PerformanceTimelineEvent | null {
    if (!this.active) return null;
    const summary =
      opts.summary ??
      (opts.phase === 'start'
        ? `Morph → ${opts.to?.toUpperCase() ?? '?'}`
        : opts.phase === 'cancel'
          ? 'Morph cancelled'
          : 'Morph ended');
    return this.pushEvent({
      kind: 'morph',
      summary,
      confidence: 'high',
      inferred: false,
      honesty: 'experimental',
      data: { ...opts },
      makeMarker: opts.phase === 'start' || opts.phase === 'cancel',
    });
  }

  recordFlip(opts: { phase: string; summary?: string; data?: Record<string, unknown> }): PerformanceTimelineEvent | null {
    if (!this.active) return null;
    return this.pushEvent({
      kind: 'flip',
      summary: opts.summary ?? `FLIP ${opts.phase}`,
      confidence: 'high',
      inferred: false,
      honesty: 'experimental',
      data: { phase: opts.phase, ...(opts.data ?? {}) },
      makeMarker: opts.phase === 'recording' || opts.phase === 'ready',
    });
  }

  addManualMarker(label = 'Mark'): PerformanceMarker | null {
    if (!this.active) return null;
    const pos = this.position();
    const eventId = makeId('pev');
    const markerId = makeId('pmk');
    const ev: PerformanceTimelineEvent = {
      id: eventId,
      kind: 'marker',
      atMs: pos.atMs,
      relativeMs: pos.relativeMs,
      sample: pos.sample,
      seconds: pos.seconds,
      summary: label,
      confidence: 'high',
      inferred: false,
      honesty: 'experimental',
      data: { source: 'manual' },
      markerId,
    };
    const marker: PerformanceMarker = {
      id: markerId,
      sample: pos.sample,
      seconds: pos.seconds,
      label,
      source: 'manual',
      inferred: false,
      eventId,
    };
    this.events = [...this.events, ev].slice(-TIMELINE_LIMIT);
    this.markers = [...this.markers, marker];
    this.emit();
    return marker;
  }

  renameMarker(id: string, label: string): boolean {
    const i = this.markers.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const next = { ...this.markers[i]!, label: label.trim() || this.markers[i]!.label };
    this.markers = this.markers.map((m, j) => (j === i ? next : m));
    this.events = this.events.map((e) =>
      e.markerId === id ? { ...e, summary: next.label } : e,
    );
    this.emit();
    return true;
  }

  deleteMarker(id: string): boolean {
    if (!this.markers.some((m) => m.id === id)) return false;
    this.markers = this.markers.filter((m) => m.id !== id);
    this.events = this.events.map((e) =>
      e.markerId === id ? { ...e, markerId: null } : e,
    );
    this.emit();
    return true;
  }

  /**
   * Whether a timeline event may drive Section Bridge outbound.
   * Requires prefs.sectionEventActionsEnabled and a confirmed (non-inferred) project-change.
   */
  mayRunSectionEventAction(ev: PerformanceTimelineEvent): boolean {
    if (!this.prefs.sectionEventActionsEnabled) return false;
    if (ev.inferred) return false;
    return ev.kind === 'project-change';
  }

  exportDiagnostic(): Record<string, unknown> {
    const snap = this.getSnapshot();
    return {
      exportedAt: new Date().toISOString(),
      honesty: snap.honesty,
      active: snap.active,
      prefs: snap.prefs,
      eventCount: snap.events.length,
      markerCount: snap.markers.length,
      events: snap.events.slice(-40),
      markers: snap.markers,
      live: this.liveLog.exportEvents().slice(0, 20),
    };
  }

  private pushEvent(opts: {
    kind: MusicalEventKind;
    summary: string;
    confidence: MusicalEventConfidence;
    inferred: boolean;
    honesty: 'experimental' | 'untested' | 'verified';
    data: Record<string, unknown>;
    makeMarker: boolean;
  }): PerformanceTimelineEvent {
    const pos = this.position();
    const id = makeId('pev');
    let markerId: string | null = null;
    if (opts.makeMarker) {
      markerId = makeId('pmk');
      const marker: PerformanceMarker = {
        id: markerId,
        sample: pos.sample,
        seconds: pos.seconds,
        label: markerLabelFor({
          kind: opts.kind,
          summary: opts.summary,
          inferred: opts.inferred,
        }),
        source: markerSourceFor(opts.kind, opts.inferred),
        inferred: opts.inferred,
        eventId: id,
      };
      this.markers = [...this.markers, marker];
    }
    const row: PerformanceTimelineEvent = {
      id,
      kind: opts.kind,
      atMs: pos.atMs,
      relativeMs: pos.relativeMs,
      sample: pos.sample,
      seconds: pos.seconds,
      summary: opts.summary,
      confidence: opts.confidence,
      inferred: opts.inferred,
      honesty: opts.honesty,
      data: opts.data,
      markerId,
    };
    this.events = [...this.events, row].slice(-TIMELINE_LIMIT);
    this.emit();
    return row;
  }
}

/** Map Performance markers → Session Recorder TakeMarker shape (with id). */
export function toTakeMarkers(
  markers: readonly PerformanceMarker[],
): Array<{
  id: string;
  sample: number;
  seconds: number;
  label: string;
  source: PerformanceMarkerSource;
  inferred: boolean;
}> {
  return markers.map((m) => ({
    id: m.id,
    sample: m.sample,
    seconds: m.seconds,
    label: m.label,
    source: m.source,
    inferred: m.inferred,
  }));
}
