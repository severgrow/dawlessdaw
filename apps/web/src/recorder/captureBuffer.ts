/**
 * P3 capture buffering — batch IndexedDB persistence off the Worklet message path.
 *
 * - No SharedArrayBuffer (main-thread queue only).
 * - RAM chunks remain the source of truth for stop/stitch.
 * - Pending IDB writes may be dropped under backlog; dropped frames are counted.
 * - I/O stays async (never sync in the message handler).
 */

import type { PcmChunk } from './stitch';

export interface CaptureBufferStats {
  /** Worklet (or test) PCM messages accepted into the buffer. */
  workletMessages: number;
  framesAccepted: number;
  /** Frames whose IDB persist was abandoned under backlog pressure. */
  framesDropped: number;
  persistFlushes: number;
  persistChunksWritten: number;
  pendingPersistChunks: number;
  /** Approx bytes of interleaved float32 held for the take (RAM). */
  ramBytesApprox: number;
  lastFlushAtMs: number | null;
}

export interface CapturePersistBufferOpts {
  /** Flush after this many queued persist chunks (default 8 ≈ 8×128 frames). */
  batchSize?: number;
  /** Also flush on this interval while recording (default 50 ms). */
  flushIntervalMs?: number;
  /**
   * Max pending IDB chunks. Beyond this, oldest pending persist jobs are
   * dropped (RAM take kept). Default 256.
   */
  maxPendingPersist?: number;
  /** Async batch writer (IndexedDB). Must not throw into realtime. */
  appendBatch: (takeId: string, chunks: PcmChunk[]) => Promise<void>;
  /** Optional clock for tests. */
  nowMs?: () => number;
  /** Optional timer hooks for tests. */
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearSchedule?: (id: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_BATCH = 8;
const DEFAULT_INTERVAL_MS = 50;
const DEFAULT_MAX_PENDING = 256;

export function emptyCaptureBufferStats(): CaptureBufferStats {
  return {
    workletMessages: 0,
    framesAccepted: 0,
    framesDropped: 0,
    persistFlushes: 0,
    persistChunksWritten: 0,
    pendingPersistChunks: 0,
    ramBytesApprox: 0,
    lastFlushAtMs: null,
  };
}

/**
 * Main-thread persist buffer. Call {@link push} from the Worklet `onmessage`
 * handler; I/O runs only inside {@link flush}.
 */
export class CapturePersistBuffer {
  private takeId: string | null = null;
  private pending: PcmChunk[] = [];
  private ramBytes = 0;
  private stats = emptyCaptureBufferStats();
  private flushChain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxPendingPersist: number;
  private readonly appendBatch: (takeId: string, chunks: PcmChunk[]) => Promise<void>;
  private readonly nowMs: () => number;
  private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearSchedule: (id: ReturnType<typeof setTimeout>) => void;

  constructor(opts: CapturePersistBufferOpts) {
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH;
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxPendingPersist = opts.maxPendingPersist ?? DEFAULT_MAX_PENDING;
    this.appendBatch = opts.appendBatch;
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearSchedule = opts.clearSchedule ?? ((id) => clearTimeout(id));
  }

  begin(takeId: string): void {
    this.reset();
    this.takeId = takeId;
    this.armTimer();
  }

  /** Sync ingest — keep work off the audio render thread (already on main). */
  push(chunk: PcmChunk): void {
    const frames = Math.floor(chunk.samples.length / 2);
    this.stats.workletMessages += 1;
    this.stats.framesAccepted += frames;
    this.ramBytes += chunk.samples.byteLength;
    this.stats.ramBytesApprox = this.ramBytes;

    this.pending.push(chunk);
    this.trimPendingIfNeeded();
    this.stats.pendingPersistChunks = this.pending.length;

    if (this.pending.length >= this.batchSize) {
      void this.flush();
    }
  }

  /** Drain pending writes. Safe to await on stop. */
  flush(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this.flushOnce()).catch(() => {
      // Keep recording; next flush may succeed.
    });
    return this.flushChain;
  }

  async end(): Promise<CaptureBufferStats> {
    this.disarmTimer();
    await this.flush();
    const snap = this.snapshot();
    this.takeId = null;
    return snap;
  }

  snapshot(): CaptureBufferStats {
    return {
      ...this.stats,
      pendingPersistChunks: this.pending.length,
      ramBytesApprox: this.ramBytes,
    };
  }

  reset(): void {
    this.disarmTimer();
    this.pending = [];
    this.ramBytes = 0;
    this.stats = emptyCaptureBufferStats();
    this.flushChain = Promise.resolve();
    this.takeId = null;
  }

  private trimPendingIfNeeded(): void {
    while (this.pending.length > this.maxPendingPersist) {
      const dropped = this.pending.shift();
      if (!dropped) break;
      this.stats.framesDropped += Math.floor(dropped.samples.length / 2);
    }
  }

  private async flushOnce(): Promise<void> {
    const takeId = this.takeId;
    if (!takeId || this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    this.stats.pendingPersistChunks = this.pending.length;
    try {
      await this.appendBatch(takeId, batch);
      this.stats.persistFlushes += 1;
      this.stats.persistChunksWritten += batch.length;
      this.stats.lastFlushAtMs = this.nowMs();
    } catch {
      // Re-queue at front so recovery can still try; may drop under maxPending.
      this.pending = batch.concat(this.pending);
      this.trimPendingIfNeeded();
      this.stats.pendingPersistChunks = this.pending.length;
      throw new Error('persist flush failed');
    }
  }

  private armTimer(): void {
    this.disarmTimer();
    if (this.flushIntervalMs <= 0) return;
    const tick = () => {
      this.timer = null;
      void this.flush().finally(() => {
        if (this.takeId) this.armTimer();
      });
    };
    this.timer = this.schedule(tick, this.flushIntervalMs);
  }

  private disarmTimer(): void {
    if (this.timer !== null) {
      this.clearSchedule(this.timer);
      this.timer = null;
    }
  }
}

/** Estimate Worklet message rate (msgs/s) from stats + elapsed. */
export function estimateWorkletMsgRate(
  stats: CaptureBufferStats,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return 0;
  return (stats.workletMessages * 1000) / elapsedMs;
}

/** Rough IDB write rate (chunks/s) from completed flushes. */
export function estimatePersistChunkRate(
  stats: CaptureBufferStats,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return 0;
  return (stats.persistChunksWritten * 1000) / elapsedMs;
}
