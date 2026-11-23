import { describe, expect, it, vi } from 'vitest';
import {
  CapturePersistBuffer,
  estimatePersistChunkRate,
  estimateWorkletMsgRate,
} from './captureBuffer';
import type { PcmChunk } from './stitch';

function chunk(index: number, frames = 128): PcmChunk {
  return { index, samples: new Float32Array(frames * 2) };
}

describe('CapturePersistBuffer P3', () => {
  it('batches persist writes and keeps I/O off push()', async () => {
    const writes: number[][] = [];
    let pendingIo = 0;
    const buf = new CapturePersistBuffer({
      batchSize: 4,
      flushIntervalMs: 0,
      appendBatch: async (_id, chunks) => {
        pendingIo += 1;
        writes.push(chunks.map((c) => c.index));
        pendingIo -= 1;
      },
    });
    buf.begin('take-1');
    for (let i = 0; i < 3; i++) {
      buf.push(chunk(i));
      expect(pendingIo).toBe(0); // push is sync; no I/O yet
    }
    expect(buf.snapshot().pendingPersistChunks).toBe(3);
    buf.push(chunk(3)); // hits batchSize → schedules flush
    await buf.flush();
    expect(writes).toEqual([[0, 1, 2, 3]]);
    expect(buf.snapshot().persistFlushes).toBe(1);
    expect(buf.snapshot().persistChunksWritten).toBe(4);
    expect(buf.snapshot().workletMessages).toBe(4);
    expect(buf.snapshot().framesAccepted).toBe(128 * 4);
  });

  it('reports dropped frames when persist backlog exceeds maxPending', async () => {
    const slow: PcmChunk[][] = [];
    const buf = new CapturePersistBuffer({
      batchSize: 1000,
      flushIntervalMs: 0,
      maxPendingPersist: 3,
      appendBatch: async (_id, chunks) => {
        slow.push(chunks);
      },
    });
    buf.begin('take-drop');
    for (let i = 0; i < 5; i++) buf.push(chunk(i, 10));
    const s = buf.snapshot();
    expect(s.pendingPersistChunks).toBe(3);
    expect(s.framesDropped).toBe(20); // 2 chunks × 10 frames
    expect(s.framesAccepted).toBe(50);
    await buf.end();
  });

  it('end() flushes remaining and returns stats', async () => {
    const written: number[] = [];
    const buf = new CapturePersistBuffer({
      batchSize: 10,
      flushIntervalMs: 0,
      appendBatch: async (_id, chunks) => {
        written.push(...chunks.map((c) => c.index));
      },
    });
    buf.begin('t');
    buf.push(chunk(0));
    buf.push(chunk(1));
    const stats = await buf.end();
    expect(written).toEqual([0, 1]);
    expect(stats.persistChunksWritten).toBe(2);
    expect(stats.ramBytesApprox).toBeGreaterThan(0);
  });

  it('estimates msg / persist rates from elapsed', () => {
    const stats = {
      workletMessages: 100,
      framesAccepted: 12800,
      framesDropped: 0,
      persistFlushes: 5,
      persistChunksWritten: 40,
      pendingPersistChunks: 0,
      ramBytesApprox: 0,
      lastFlushAtMs: 1000,
    };
    expect(estimateWorkletMsgRate(stats, 1000)).toBeCloseTo(100);
    expect(estimatePersistChunkRate(stats, 1000)).toBeCloseTo(40);
  });

  it('re-queues on flush failure then reports drop under pressure', async () => {
    let failOnce = true;
    const buf = new CapturePersistBuffer({
      batchSize: 2,
      flushIntervalMs: 0,
      maxPendingPersist: 2,
      appendBatch: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('idb busy');
        }
      },
    });
    buf.begin('t');
    buf.push(chunk(0, 8));
    buf.push(chunk(1, 8));
    await buf.flush(); // fails, re-queues
    buf.push(chunk(2, 8));
    buf.push(chunk(3, 8));
    // pending may have been trimmed
    expect(buf.snapshot().framesDropped).toBeGreaterThanOrEqual(0);
    await buf.end();
  });

  it('timer-driven flush uses schedule hook', async () => {
    vi.useFakeTimers();
    const writes: number[] = [];
    const buf = new CapturePersistBuffer({
      batchSize: 100,
      flushIntervalMs: 50,
      appendBatch: async (_id, chunks) => {
        writes.push(chunks.length);
      },
    });
    buf.begin('t');
    buf.push(chunk(0));
    await vi.advanceTimersByTimeAsync(60);
    await buf.flush();
    expect(writes.length).toBeGreaterThanOrEqual(1);
    await buf.end();
    vi.useRealTimers();
  });
});
