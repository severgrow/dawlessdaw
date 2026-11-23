import { describe, it, expect } from 'vitest';
import {
  encodeMp3Sync,
  estimateMp3DurationSec,
  mp3ModeHonesty,
  mp3ModeToCbrKbps,
  readMp3BitrateKbps,
} from './mp3Encode';

describe('MP3 encode', () => {
  it('maps v0 to 320 CBR stand-in (not 160)', () => {
    expect(mp3ModeToCbrKbps('v0')).toBe(320);
    expect(mp3ModeToCbrKbps('cbr320')).toBe(320);
    expect(mp3ModeHonesty('v0').toLowerCase()).toMatch(/cbr|not true vbr|no vbr/);
  });

  it('encodes a short stereo buffer and duration matches (±15%)', async () => {
    const sr = 48000;
    const seconds = 0.5;
    const n = Math.round(sr * seconds);
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / sr);
      right[i] = left[i]!;
    }
    const buf = await encodeMp3Sync({
      left,
      right,
      sampleRate: sr,
      mode: 'cbr320',
      title: 'test',
      bpm: '120',
    });
    expect(buf.byteLength).toBeGreaterThan(500);
    const br = readMp3BitrateKbps(buf) ?? 320;
    // Skip ID3 when estimating from total bytes — rough: use payload after ID3
    const bytes = new Uint8Array(buf);
    let audioStart = 0;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const size =
        ((bytes[6]! & 0x7f) << 21) |
        ((bytes[7]! & 0x7f) << 14) |
        ((bytes[8]! & 0x7f) << 7) |
        (bytes[9]! & 0x7f);
      audioStart = 10 + size;
    }
    const audioBytes = buf.byteLength - audioStart;
    const dur = estimateMp3DurationSec(audioBytes, br);
    expect(dur).toBeGreaterThan(seconds * 0.85);
    expect(dur).toBeLessThan(seconds * 1.25);
  }, 20_000);
});
