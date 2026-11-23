import { describe, it, expect } from 'vitest';
import { encodeWav, parseWavHeader } from './wav';
import type { StereoAudio } from './types';

const stereo = (L: number[], R: number[], sampleRate = 48000): StereoAudio => ({
  sampleRate,
  left: Float32Array.from(L),
  right: Float32Array.from(R),
});

describe('WAV encode', () => {
  it('writes 16-bit PCM header and interleaved samples', () => {
    const audio = stereo([1, -1], [0, 0.5]);
    const buf = encodeWav(audio, 16, undefined, { dither: false });
    const h = parseWavHeader(buf);
    expect(h.audioFormat).toBe(1);
    expect(h.numChannels).toBe(2);
    expect(h.sampleRate).toBe(48000);
    expect(h.bitsPerSample).toBe(16);
    expect(h.dataSize).toBe(8);
    const v = new DataView(buf);
    expect(v.getInt16(h.dataOffset, true)).toBe(32767);
    expect(v.getInt16(h.dataOffset + 2, true)).toBe(0);
    expect(v.getInt16(h.dataOffset + 4, true)).toBe(-32768);
    expect(v.getInt16(h.dataOffset + 6, true)).toBe(16384);
  });

  it('writes 24-bit PCM samples (little-endian 3 bytes)', () => {
    const audio = stereo([1], [-0.5]);
    const buf = encodeWav(audio, 24, undefined, { dither: false });
    const h = parseWavHeader(buf);
    expect(h.audioFormat).toBe(1);
    expect(h.bitsPerSample).toBe(24);
    expect(h.dataSize).toBe(6);
    const bytes = new Uint8Array(buf, h.dataOffset, 6);
    // 1.0 → 0x7fffff
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xff);
    expect(bytes[2]).toBe(0x7f);
    // -0.5 → −0x400000 as signed 24-bit LE
    let n = bytes[3]! | (bytes[4]! << 8) | (bytes[5]! << 16);
    if (n & 0x800000) n |= ~0xffffff;
    expect(n).toBe(-0x400000);
  });

  it('writes 32-bit float IEEE samples', () => {
    const audio = stereo([0.25], [-0.5]);
    const buf = encodeWav(audio, 32);
    const h = parseWavHeader(buf);
    expect(h.audioFormat).toBe(3);
    expect(h.bitsPerSample).toBe(32);
    const v = new DataView(buf);
    expect(v.getFloat32(h.dataOffset, true)).toBeCloseTo(0.25, 5);
    expect(v.getFloat32(h.dataOffset + 4, true)).toBeCloseTo(-0.5, 5);
  });

  it('embeds INFO tags when provided', () => {
    const audio = stereo([0], [0]);
    const buf = encodeWav(audio, 24, { title: 'Ploe jam', date: '2026-11-22', bpm: '128' }, {
      dither: false,
    });
    const text = String.fromCharCode(...new Uint8Array(buf));
    expect(text).toContain('LIST');
    expect(text).toContain('INFO');
    expect(text).toContain('INAM');
    expect(text).toContain('Ploe jam');
    expect(text).toContain('ICRD');
    expect(text).toContain('IKEY');
  });

  it('float32 is transparent (no dither); int path can dither with seeded RNG', () => {
    const audio = stereo([0.25], [-0.5]);
    const f = encodeWav(audio, 32);
    const hf = parseWavHeader(f);
    expect(new DataView(f).getFloat32(hf.dataOffset, true)).toBeCloseTo(0.25, 5);

    let i = 0;
    const seq = [0.1, 0.9, 0.2, 0.8];
    const buf = encodeWav(audio, 16, undefined, {
      dither: true,
      random: () => seq[i++ % seq.length]!,
    });
    const quiet = encodeWav(audio, 16, undefined, { dither: false });
    expect(buf.byteLength).toBe(quiet.byteLength);
    // Dithered path still produces valid 16-bit PCM
    expect(parseWavHeader(buf).bitsPerSample).toBe(16);
  });
});
