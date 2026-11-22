import { describe, it, expect } from 'vitest';
import {
  applyEdit,
  cleanSampleName,
  encodeWav16,
  normalizePeak,
  padFileName,
  trimAudio,
  waveformPeaks,
  type PadAudio,
} from './samplePrep';

const mono = (values: number[], sampleRate = 10): PadAudio => ({
  sampleRate,
  channels: [Float32Array.from(values)],
});

describe('SP sample prep', () => {
  it('names files by bank and pad', () => {
    expect(padFileName('A', 1, 'Kick 01.wav')).toBe('A01 Kick 01.wav');
    expect(padFileName('D', 16, 'snare')).toBe('D16 snare.wav');
  });

  it('cleans names: no path characters, ASCII only, max 24 chars', () => {
    expect(cleanSampleName('my/loop:take*2.aiff')).toBe('my loop take 2');
    expect(cleanSampleName('Café groove.mp3')).toBe('Cafe groove');
    expect(cleanSampleName('a'.repeat(40))).toHaveLength(24);
    expect(cleanSampleName('.wav')).toBe('sample');
  });

  it('trims by seconds and clamps out-of-range values', () => {
    const a = mono([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // 1 s at 10 Hz
    expect(Array.from(trimAudio(a, 0.2, 0.5).channels[0]!)).toEqual([2, 3, 4]);
    expect(Array.from(trimAudio(a, 0.8, null).channels[0]!)).toEqual([8, 9]);
    expect(trimAudio(a, -1, 99).channels[0]!.length).toBe(10);
    expect(trimAudio(a, 0.5, 0.2).channels[0]!.length).toBe(0);
  });

  it('normalizes the loudest point to just under full scale and leaves silence alone', () => {
    const n = normalizePeak(mono([0.1, -0.5, 0.25]));
    expect(Math.max(...Array.from(n.channels[0]!).map(Math.abs))).toBeCloseTo(0.977, 3);
    const silent = mono([0, 0]);
    expect(normalizePeak(silent)).toBe(silent);
  });

  it('applies trim then normalize', () => {
    const out = applyEdit(mono([1, 0.5, 0.25, 0]), {
      name: 'x',
      trimStart: 0.1,
      trimEnd: 0.3,
      normalize: true,
    });
    expect(Array.from(out.channels[0]!).map((v) => +v.toFixed(3))).toEqual([0.977, 0.488]);
  });

  it('writes a valid 16-bit stereo WAV header and data', () => {
    const audio: PadAudio = {
      sampleRate: 48000,
      channels: [Float32Array.from([1, -1]), Float32Array.from([0, 0.5])],
    };
    const buf = encodeWav16(audio);
    const v = new DataView(buf);
    const str = (o: number, n: number) =>
      String.fromCharCode(...new Uint8Array(buf, o, n));
    expect(str(0, 4)).toBe('RIFF');
    expect(str(8, 4)).toBe('WAVE');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // stereo
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8); // 2 frames × 2 ch × 2 bytes
    expect(buf.byteLength).toBe(52);
    // Interleaved L R L R
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(0);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(16384);
  });

  it('computes waveform peaks', () => {
    expect(waveformPeaks(mono([0, 1, -0.5, 0.25]), 2)).toEqual([1, 0.5]);
  });
});
