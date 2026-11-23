/**
 * Rolling “capture last N bars” on top of MidiEventRecorder (plan step 8).
 *
 * Observation only: never sends MIDI, never touches routing, never enables
 * app clock forwarding, never touches audio. Bar-aligns only when clock
 * confidence is High; otherwise returns an honest approximate window.
 */

import type { MidiMessage, PortId } from '@dawlessdaw/core';
import {
  MidiEventRecorder,
  type MidiEventRecorderOptions,
  type MidiRecorderPosition,
  type RecordedMidiEvent,
} from './event-recorder';

/** MIDI clocks per bar in 4/4 (24 PPQN × 4). Documented assumption. */
export const CAPTURE_PPQN = 24;
export const CAPTURE_CLOCKS_PER_BAR = CAPTURE_PPQN * 4;

export const CAPTURE_BAR_OPTIONS = [1, 2, 4, 8, 16] as const;
export type CaptureBarCount = (typeof CAPTURE_BAR_OPTIONS)[number];

export type CaptureClockConfidence = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface CaptureClockHint {
  confidence: CaptureClockConfidence;
  /** e.g. STABLE | VARIABLE | CLOCK LOST | UNKNOWN */
  status?: string;
  bpm: number | null;
  clockDetected?: boolean;
  /** Current musical position when a clock authority is known. */
  position?: MidiRecorderPosition | null;
}

export interface CaptureSourceSummary {
  kind: 'incoming' | 'outbound';
  portId: PortId;
}

export interface CaptureInterval {
  kind: 'bars' | 'wall-ms';
  /** Requested bars (may exceed what the buffer held). */
  requestedBars: number;
  /** Bars spanned when bar-aligned; null for wall-time windows. */
  bars: number | null;
  startTickCount: number | null;
  endTickCount: number | null;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export type CaptureQuality = 'bar-aligned' | 'approximate' | 'empty' | 'truncated';

export interface CaptureLastNBarsResult {
  honesty: 'experimental';
  requestedBars: number;
  actualInterval: CaptureInterval;
  clock: {
    bpm: number | null;
    confidence: CaptureClockConfidence;
    status: string | null;
    barAligned: boolean;
    transport: MidiRecorderPosition['transport'] | null;
    endBar: number | null;
    endBeat: number | null;
    endTickCount: number | null;
  };
  sources: CaptureSourceSummary[];
  events: readonly RecordedMidiEvent[];
  quality: CaptureQuality;
  limitations: string[];
}

export interface RollingMidiCaptureOptions {
  /** Max events in the rolling ring. Default 4096. */
  eventCapacity?: number;
  /**
   * Soft byte budget for retained event payloads (+ small overhead).
   * Oldest events drop when exceeded. Default ~512 KiB.
   */
  maxBytes?: number;
  now?: () => number;
  getPosition?: () => MidiRecorderPosition | null;
  recordClockTicks?: boolean;
}

const DEFAULT_MAX_BYTES = 512 * 1024;
const EVENT_OVERHEAD = 64;

function eventBytes(ev: RecordedMidiEvent): number {
  return ev.data.byteLength + EVENT_OVERHEAD;
}

/** High confidence + detected clock + usable BPM → bar-align allowed. */
export function isClockConfidentForBars(hint: CaptureClockHint): boolean {
  return (
    hint.confidence === 'High' &&
    hint.clockDetected !== false &&
    hint.bpm != null &&
    Number.isFinite(hint.bpm) &&
    hint.bpm > 0
  );
}

export function barDurationMs(bpm: number): number {
  return (4 * 60_000) / bpm;
}

function summarizeSources(events: readonly RecordedMidiEvent[]): CaptureSourceSummary[] {
  const seen = new Set<string>();
  const out: CaptureSourceSummary[] = [];
  for (const ev of events) {
    const key = `${ev.source.kind}:${ev.source.portId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: ev.source.kind, portId: ev.source.portId });
  }
  return out;
}

/**
 * Pure window extract — used by RollingMidiCapture and unit tests.
 */
export function extractLastNBars(
  events: readonly RecordedMidiEvent[],
  requestedBars: number,
  clock: CaptureClockHint,
  opts?: { nowMs?: number; droppedFromRing?: number },
): CaptureLastNBarsResult {
  const n = Math.max(1, Math.floor(requestedBars));
  const nowMs = opts?.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const limitations: string[] = [];
  const pos = clock.position ?? null;
  const confident = isClockConfidentForBars(clock);
  const canBarAlign =
    confident && pos != null && Number.isFinite(pos.tickCount) && pos.tickCount >= 0;

  if (!confident) {
    limitations.push(
      'Clock not confident — window is a wall-time estimate, not bar-aligned.',
    );
  } else if (!pos) {
    limitations.push('Clock looks steady but musical position is unknown — wall-time window.');
  }

  if ((opts?.droppedFromRing ?? 0) > 0) {
    limitations.push('Rolling buffer dropped older events — capture may be truncated.');
  }

  let filtered: RecordedMidiEvent[];
  let quality: CaptureQuality;
  let interval: CaptureInterval;
  let barAligned = false;

  if (canBarAlign && pos) {
    barAligned = true;
    const endTick = pos.tickCount;
    const startTick = Math.max(0, endTick - n * CAPTURE_CLOCKS_PER_BAR);
    filtered = events.filter((ev) => {
      if (ev.position && Number.isFinite(ev.position.tickCount)) {
        return ev.position.tickCount >= startTick && ev.position.tickCount <= endTick;
      }
      return false;
    });

    const startMs =
      filtered.length > 0 ? filtered[0]!.atMs : nowMs - n * barDurationMs(clock.bpm!);
    const endMs = filtered.length > 0 ? filtered[filtered.length - 1]!.atMs : nowMs;
    const spanTicks =
      filtered.length > 0
        ? Math.max(
            ...filtered.map((e) => e.position?.tickCount ?? startTick),
          ) - startTick
        : 0;
    const actualBars = Math.min(n, spanTicks / CAPTURE_CLOCKS_PER_BAR);

    interval = {
      kind: 'bars',
      requestedBars: n,
      bars: Math.round(actualBars * 1000) / 1000,
      startTickCount: startTick,
      endTickCount: endTick,
      startMs,
      endMs: Math.max(endMs, nowMs),
      durationMs: Math.max(0, Math.max(endMs, nowMs) - startMs),
    };

    if (filtered.length === 0) {
      quality = 'empty';
      limitations.push('No MIDI events in the last N bars of the rolling buffer.');
    } else if (
      events.length > 0 &&
      events[0]!.position &&
      events[0]!.position.tickCount > startTick
    ) {
      quality = 'truncated';
      limitations.push('Buffer does not reach full N bars — earlier events were aged out.');
    } else {
      quality = 'bar-aligned';
    }
  } else {
    const bpm = clock.bpm != null && clock.bpm > 0 ? clock.bpm : 120;
    if (clock.bpm == null || clock.bpm <= 0) {
      limitations.push('BPM unknown — assumed 120 for wall-time window length.');
    }
    const durationMs = n * barDurationMs(bpm);
    const startMs = nowMs - durationMs;
    filtered = events.filter((ev) => ev.atMs >= startMs && ev.atMs <= nowMs);

    interval = {
      kind: 'wall-ms',
      requestedBars: n,
      bars: null,
      startTickCount: null,
      endTickCount: null,
      startMs,
      endMs: nowMs,
      durationMs,
    };

    if (filtered.length === 0) {
      quality = 'empty';
      limitations.push('No MIDI events in the estimated wall-time window.');
    } else if (events.length > 0 && events[0]!.atMs > startMs) {
      quality = 'truncated';
      limitations.push('Buffer does not cover the full estimated window.');
    } else {
      quality = 'approximate';
    }
  }

  return {
    honesty: 'experimental',
    requestedBars: n,
    actualInterval: interval,
    clock: {
      bpm: clock.bpm,
      confidence: clock.confidence,
      status: clock.status ?? null,
      barAligned,
      transport: pos?.transport ?? null,
      endBar: pos?.bar ?? null,
      endBeat: pos?.beat ?? null,
      endTickCount: pos?.tickCount ?? null,
    },
    sources: summarizeSources(filtered),
    events: filtered,
    quality,
    limitations,
  };
}

/**
 * Rolling observer: feeds MidiEventRecorder and extracts last-N-bar captures.
 */
export class RollingMidiCapture {
  private readonly recorder: MidiEventRecorder;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private approxBytes = 0;
  private byteDropped = 0;

  constructor(opts?: RollingMidiCaptureOptions) {
    const recorderOpts: MidiEventRecorderOptions = {
      capacity: opts?.eventCapacity ?? 4096,
      now: opts?.now,
      getPosition: opts?.getPosition,
      recordClockTicks: opts?.recordClockTicks,
    };
    this.recorder = new MidiEventRecorder(recorderOpts);
    this.maxBytes = Math.max(64, opts?.maxBytes ?? DEFAULT_MAX_BYTES);
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** Begin retaining observed events. */
  start(): void {
    this.recorder.start();
  }

  stop(): void {
    this.recorder.stop();
  }

  isActive(): boolean {
    return this.recorder.isRecording();
  }

  clear(): void {
    this.recorder.clear();
    this.approxBytes = 0;
    this.byteDropped = 0;
  }

  getRecorder(): MidiEventRecorder {
    return this.recorder;
  }

  getApproxBytes(): number {
    return this.approxBytes;
  }

  getByteDropped(): number {
    return this.byteDropped;
  }

  observeIncoming(message: MidiMessage): RecordedMidiEvent | null {
    const ev = this.recorder.recordIncoming(message);
    if (ev) this.afterPush(ev);
    return ev;
  }

  observeOutbound(
    message: MidiMessage,
    opts?: { routeId?: string; portId?: PortId },
  ): RecordedMidiEvent | null {
    const ev = this.recorder.recordOutbound(message, opts);
    if (ev) this.afterPush(ev);
    return ev;
  }

  captureLastBars(requestedBars: number, clock: CaptureClockHint): CaptureLastNBarsResult {
    return extractLastNBars(this.recorder.getEvents(), requestedBars, clock, {
      nowMs: this.now(),
      droppedFromRing: this.recorder.getDropped() + this.byteDropped,
    });
  }

  private afterPush(_ev: RecordedMidiEvent): void {
    this.recomputeBytes();
    while (this.approxBytes > this.maxBytes && this.recorder.size() > 0) {
      const removed = this.recorder.dropOldest(1);
      if (removed === 0) break;
      this.byteDropped += removed;
      this.recomputeBytes();
    }
  }

  private recomputeBytes(): void {
    let sum = 0;
    for (const ev of this.recorder.getEvents()) sum += eventBytes(ev);
    this.approxBytes = sum;
  }
}
