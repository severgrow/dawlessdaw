import { describe, expect, it } from 'vitest';
import { findOnset, median, summarizeLatency, windowRms, type LatencySample } from './onset';

describe('onset helpers', () => {
  it('windowRms measures energy', () => {
    const silent = new Float32Array(64);
    expect(windowRms(silent, 0, 64)).toBe(0);
    const loud = new Float32Array(64).fill(0.5);
    expect(windowRms(loud, 0, 64)).toBeCloseTo(0.5, 5);
  });

  it('findOnset locates a rising burst after silence', () => {
    const sr = 48000;
    const buf = new Float32Array(sr); // 1s silence then click
    const clickAt = Math.round(sr * 0.1);
    for (let i = clickAt; i < clickAt + 200; i++) buf[i] = 0.4;
    const hit = findOnset(buf, sr, { searchFrom: 0 });
    expect(hit).not.toBeNull();
    expect(hit!.timeMs).toBeGreaterThan(80);
    expect(hit!.timeMs).toBeLessThan(130);
    expect(['High', 'Medium', 'Low']).toContain(hit!.confidence);
  });

  it('findOnset returns null when silent', () => {
    const buf = new Float32Array(8000);
    expect(findOnset(buf, 48000)).toBeNull();
  });

  it('median and summarizeLatency', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
    const samples: LatencySample[] = [
      { sentAt: 0, onsetAt: 12, latencyMs: 12, confidence: 'High', note: 60, channel: 1 },
      { sentAt: 0, onsetAt: 14, latencyMs: 14, confidence: 'High', note: 60, channel: 1 },
      { sentAt: 0, onsetAt: 20, latencyMs: 20, confidence: 'High', note: 60, channel: 1 },
      { sentAt: 0, onsetAt: null, latencyMs: null, confidence: 'Unknown', note: 60, channel: 1 },
    ];
    const s = summarizeLatency(samples);
    expect(s.hits).toBe(3);
    expect(s.minMs).toBe(12);
    expect(s.maxMs).toBe(20);
    expect(s.medianMs).toBe(14);
    expect(s.caveat).toMatch(/attack time/i);
  });
});
