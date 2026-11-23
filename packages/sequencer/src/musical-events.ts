/**
 * Shared musical-event model — foundation for Circuit Intelligence and later
 * milestones (Timing Lab, Performance Memory, MIDI-guided FLIP).
 *
 * Analysis only: append/query. Never sends MIDI. Keep off the routing path.
 */

export type MusicalEventKind =
  | 'transport-start'
  | 'transport-stop'
  | 'transport-continue'
  | 'clock-bpm'
  | 'bar'
  | 'project-change'
  | 'last-touched'
  | 'track-activity'
  | 'pattern-hint'
  | 'marker'
  | 'macro'
  | 'morph'
  | 'flip';

export type MusicalEventConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface MusicalEvent {
  id: number;
  kind: MusicalEventKind;
  at: number;
  /** Wall / performance ms when observed */
  confidence: MusicalEventConfidence;
  honesty: 'experimental' | 'untested' | 'verified';
  /** Free-form payload; keep JSON-serialisable */
  data: Record<string, unknown>;
  summary: string;
}

export type MusicalEventListener = () => void;

const DEFAULT_LIMIT = 256;

/**
 * Bounded ring of musical events. Stable getSnapshot() for React stores.
 */
export class MusicalEventLog {
  private events: MusicalEvent[] = [];
  private seq = 0;
  private cached: readonly MusicalEvent[] | null = null;
  private listeners = new Set<MusicalEventListener>();
  private readonly limit: number;

  constructor(opts?: { limit?: number }) {
    this.limit = opts?.limit ?? DEFAULT_LIMIT;
  }

  subscribe(fn: MusicalEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  /** Newest-first snapshot; same array until append/clear. */
  getSnapshot(): readonly MusicalEvent[] {
    if (!this.cached) this.cached = this.events.slice();
    return this.cached;
  }

  append(
    partial: Omit<MusicalEvent, 'id'> & { id?: number },
  ): MusicalEvent {
    this.seq += 1;
    const ev: MusicalEvent = {
      id: partial.id ?? this.seq,
      kind: partial.kind,
      at: partial.at,
      confidence: partial.confidence,
      honesty: partial.honesty,
      data: { ...partial.data },
      summary: partial.summary,
    };
    this.events = [ev, ...this.events].slice(0, this.limit);
    this.emit();
    return ev;
  }

  clear(): void {
    this.events = [];
    this.emit();
  }

  /** Export for diagnostics / later session timeline. */
  exportEvents(): MusicalEvent[] {
    return this.events.map((e) => ({ ...e, data: { ...e.data } }));
  }
}
