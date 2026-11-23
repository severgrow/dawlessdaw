/**
 * Circuit Mirror — passive loop-aware observation of Circuit Rhythm performance MIDI.
 *
 * Listens to Circuit **input** notes + clock only. Never emits MIDI. Never touches routing.
 * Clock: 24 PPQN, 6 ticks per 16th step (same as SeqScheduler).
 *
 * Cell states after loop cycles:
 *   empty — never heard (or faded out)
 *   dim   — heard this cycle for the first time (or fading)
 *   bright — confirmed across consecutive cycles
 */

import { CLOCKS_PER_STEP, PPQN } from './scheduler';

export const MIRROR_TRACK_COUNT = 8 as const;
export const MIRROR_STEP_COUNT = 16 as const;

export type MirrorCellKind = 'empty' | 'dim' | 'bright';

export type SequencerViewMode = 'circuit-live' | 'circuit-saved' | 'splot-pattern';

export interface MirrorCell {
  kind: MirrorCellKind;
  note: number;
  velocity: number;
}

export interface CircuitMirrorSnapshot {
  playing: boolean;
  playhead: number;
  length: number;
  cycle: number;
  tickCount: number;
  tracks: MirrorCell[][];
  lastNote: { track: number; note: number; velocity: number; at: number } | null;
  listening: true;
  honesty: 'experimental';
}

export type MirrorListener = () => void;

function emptyCell(): MirrorCell {
  return { kind: 'empty', note: 60, velocity: 0 };
}

function emptyGrid(): MirrorCell[][] {
  return Array.from({ length: MIRROR_TRACK_COUNT }, () =>
    Array.from({ length: MIRROR_STEP_COUNT }, emptyCell),
  );
}

function emptyHits(): boolean[][] {
  return Array.from({ length: MIRROR_TRACK_COUNT }, () =>
    Array.from({ length: MIRROR_STEP_COUNT }, () => false),
  );
}

function cloneTracks(tracks: MirrorCell[][]): MirrorCell[][] {
  return tracks.map((row) => row.map((c) => ({ ...c })));
}

/**
 * Passive Circuit Live observer. Call only with messages from the Circuit MIDI **input** port.
 */
export class CircuitMirrorEngine {
  private playing = false;
  private tickCount = 0;
  private cycle = 0;
  private length: number = MIRROR_STEP_COUNT;
  private tracks = emptyGrid();
  private hitThisCycle = emptyHits();
  private lastNote: CircuitMirrorSnapshot['lastNote'] = null;
  private listeners = new Set<MirrorListener>();
  private cachedSnapshot: CircuitMirrorSnapshot | null = null;
  private readonly now: () => number;

  constructor(opts?: { now?: () => number; length?: number }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    if (opts?.length != null) {
      this.length = Math.max(1, Math.min(MIRROR_STEP_COUNT, Math.round(opts.length)));
    }
  }

  subscribe(fn: MirrorListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cachedSnapshot = this.buildSnapshot();
    for (const fn of this.listeners) fn();
  }

  /**
   * useSyncExternalStore-safe: same object until emit().
   */
  getSnapshot(): CircuitMirrorSnapshot {
    if (!this.cachedSnapshot) this.cachedSnapshot = this.buildSnapshot();
    return this.cachedSnapshot;
  }

  private buildSnapshot(): CircuitMirrorSnapshot {
    const playhead = this.playing
      ? Math.floor(this.tickCount / CLOCKS_PER_STEP) % this.length
      : -1;
    return {
      playing: this.playing,
      playhead,
      length: this.length,
      cycle: this.cycle,
      tickCount: this.tickCount,
      tracks: cloneTracks(this.tracks),
      lastNote: this.lastNote ? { ...this.lastNote } : null,
      listening: true,
      honesty: 'experimental',
    };
  }

  /** Clear grid + transport state (does not emit MIDI). */
  reset(): void {
    this.playing = false;
    this.tickCount = 0;
    this.cycle = 0;
    this.tracks = emptyGrid();
    this.hitThisCycle = emptyHits();
    this.lastNote = null;
    this.emit();
  }

  onTransportStart(): void {
    this.playing = true;
    this.tickCount = 0;
    this.cycle = 0;
    this.hitThisCycle = emptyHits();
    // Keep previous grid as dim baseline so the next loop can confirm → bright.
    for (let t = 0; t < MIRROR_TRACK_COUNT; t++) {
      for (let s = 0; s < this.length; s++) {
        const cell = this.tracks[t]![s]!;
        if (cell.kind === 'bright') cell.kind = 'dim';
      }
    }
    this.emit();
  }

  onTransportContinue(): void {
    this.playing = true;
    this.emit();
  }

  onTransportStop(): void {
    this.playing = false;
    this.emit();
  }

  /** One MIDI Timing Clock (F8). */
  onClock(): void {
    if (!this.playing) return;
    this.tickCount += 1;
    const clocksPerLoop = this.length * CLOCKS_PER_STEP;
    if (this.tickCount > 0 && this.tickCount % clocksPerLoop === 0) {
      this.endCycle();
    } else {
      // Throttle UI: emit on step boundaries only (every 6 clocks).
      if (this.tickCount % CLOCKS_PER_STEP === 0) this.emit();
    }
  }

  private endCycle(): void {
    for (let t = 0; t < MIRROR_TRACK_COUNT; t++) {
      for (let s = 0; s < this.length; s++) {
        if (this.hitThisCycle[t]![s]) continue;
        const cell = this.tracks[t]![s]!;
        if (cell.kind === 'bright') cell.kind = 'dim';
        else if (cell.kind === 'dim') cell.kind = 'empty';
      }
    }
    this.hitThisCycle = emptyHits();
    this.cycle += 1;
    this.emit();
  }

  /**
   * Note-on from Circuit input only (caller must filter port).
   * channel 1–8 → track; ignored if not playing.
   */
  onNoteOn(channel: number, note: number, velocity: number): void {
    if (!this.playing) return;
    if (channel < 1 || channel > MIRROR_TRACK_COUNT) return;
    if (velocity <= 0) return;
    const track = channel - 1;
    const step = Math.floor(this.tickCount / CLOCKS_PER_STEP) % this.length;
    const cell = this.tracks[track]![step]!;
    const wasEmpty = cell.kind === 'empty';
    cell.kind = wasEmpty ? 'dim' : 'bright';
    cell.note = note;
    cell.velocity = velocity;
    this.hitThisCycle[track]![step] = true;
    this.lastNote = { track: channel, note, velocity, at: this.now() };
    this.emit();
  }

  /** Accept a raw MIDI status byte stream already known to be from Circuit in. */
  onMidiMessage(kind: string, channel?: number, note?: number, velocity?: number): void {
    if (kind === 'clock') {
      this.onClock();
      return;
    }
    if (kind === 'start') {
      this.onTransportStart();
      return;
    }
    if (kind === 'continue') {
      this.onTransportContinue();
      return;
    }
    if (kind === 'stop') {
      this.onTransportStop();
      return;
    }
    if (kind === 'note-on' && channel != null && note != null) {
      this.onNoteOn(channel, note, velocity ?? 0);
    }
  }

  exportDiagnostic(): Record<string, unknown> {
    const snap = this.getSnapshot();
    return {
      exportedAt: new Date().toISOString(),
      app: 'dawlessdaw',
      feature: 'circuit-mirror',
      honesty: 'experimental',
      ppqn: PPQN,
      clocksPerStep: CLOCKS_PER_STEP,
      playing: snap.playing,
      playhead: snap.playhead,
      length: snap.length,
      cycle: snap.cycle,
      tickCount: snap.tickCount,
      lastNote: snap.lastNote,
      tracks: snap.tracks.map((row, ti) =>
        row.map((c, si) => ({
          track: ti + 1,
          step: si + 1,
          kind: c.kind,
          note: c.note,
          velocity: c.velocity,
        })),
      ),
      disclaimer:
        'Passive observation of Circuit performance MIDI over USB. Not a dump of Circuit internal pattern RAM. Hardware verification required.',
    };
  }
}

/** Map a parsed .ncs pattern's first 16 steps into mirror cells (Saved view). */
export function cellsFromNcsPattern(steps: { on: boolean; note: number; velocity: number }[]): MirrorCell[] {
  const out: MirrorCell[] = [];
  for (let i = 0; i < MIRROR_STEP_COUNT; i++) {
    const st = steps[i];
    if (st?.on) {
      out.push({ kind: 'bright', note: st.note, velocity: st.velocity || 100 });
    } else {
      out.push(emptyCell());
    }
  }
  return out;
}
