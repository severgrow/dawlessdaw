/**
 * WAV encoders: 16-bit PCM, 24-bit PCM, 32-bit float.
 * Optional INFO LIST chunk (INAM / ICRD / IBPM-style IKEY for tempo).
 */
import type { StereoAudio, WavBitDepth } from './types';

export interface WavInfoTags {
  title?: string;
  date?: string;
  /** BPM as string for INFO */
  bpm?: string;
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

function padInfoString(s: string): Uint8Array {
  // Even length including null terminator per RIFF
  const bytes = new TextEncoder().encode(s);
  const len = bytes.length + 1; // null
  const padded = len + (len % 2);
  const out = new Uint8Array(padded);
  out.set(bytes, 0);
  return out;
}

function buildInfoList(tags: WavInfoTags): ArrayBuffer | null {
  const parts: { id: string; data: Uint8Array }[] = [];
  if (tags.title) parts.push({ id: 'INAM', data: padInfoString(tags.title) });
  if (tags.date) parts.push({ id: 'ICRD', data: padInfoString(tags.date) });
  if (tags.bpm) parts.push({ id: 'IKEY', data: padInfoString(`BPM ${tags.bpm}`) });
  if (!parts.length) return null;

  let size = 4; // 'INFO'
  for (const p of parts) size += 8 + p.data.length;
  const buf = new ArrayBuffer(8 + size);
  const view = new DataView(buf);
  writeString(view, 0, 'LIST');
  view.setUint32(4, size, true);
  writeString(view, 8, 'INFO');
  let o = 12;
  for (const p of parts) {
    writeString(view, o, p.id);
    view.setUint32(o + 4, p.data.length, true);
    new Uint8Array(buf, o + 8, p.data.length).set(p.data);
    o += 8 + p.data.length;
  }
  return buf;
}

export type WavEncodeOpts = {
  /**
   * TPDF dither when quantising float → int (16/24). Never applied to float32 WAV.
   * Default true for int depths; pass false for deterministic bit-exact tests.
   */
  dither?: boolean;
  /** Inject RNG for deterministic dither tests. */
  random?: () => number;
};

function tpdf(random: () => number): number {
  return random() + random() - 1;
}

function floatToInt16(v: number, dither: boolean, random: () => number): number {
  let x = v;
  if (dither) x += tpdf(random) / 0x8000;
  const c = Math.max(-1, Math.min(1, x));
  return c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff);
}

function floatToInt24(v: number, dither: boolean, random: () => number): number {
  let x = v;
  if (dither) x += tpdf(random) / 0x800000;
  const c = Math.max(-1, Math.min(1, x));
  return c < 0 ? Math.round(c * 0x800000) : Math.round(c * 0x7fffff);
}

/**
 * Encode stereo WAV at the recorded sample rate.
 * bitDepth 16/24 = integer PCM (optional TPDF dither); 32 = IEEE float (transparent, no dither).
 */
export function encodeWav(
  audio: StereoAudio,
  bitDepth: WavBitDepth = 24,
  tags?: WavInfoTags,
  opts: WavEncodeOpts = {},
): ArrayBuffer {
  const frames = Math.min(audio.left.length, audio.right.length);
  const numChannels = 2;
  const isFloat = bitDepth === 32;
  const dither = !isFloat && opts.dither !== false;
  const random = opts.random ?? Math.random;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const info = tags ? buildInfoList(tags) : null;
  const infoBytes = info ? info.byteLength : 0;

  // fmt chunk: 16 for PCM, 18 for float (extensible-ish — we use 16 + audioFormat 3)
  const fmtSize = isFloat ? 18 : 16;
  const riffSize = 4 + (8 + fmtSize) + (8 + dataSize) + infoBytes;
  const buffer = new ArrayBuffer(8 + riffSize);
  const view = new DataView(buffer);
  let o = 0;

  writeString(view, o, 'RIFF');
  o += 4;
  view.setUint32(o, riffSize, true);
  o += 4;
  writeString(view, o, 'WAVE');
  o += 4;

  writeString(view, o, 'fmt ');
  o += 4;
  view.setUint32(o, fmtSize, true);
  o += 4;
  view.setUint16(o, isFloat ? 3 : 1, true); // format
  o += 2;
  view.setUint16(o, numChannels, true);
  o += 2;
  view.setUint32(o, audio.sampleRate, true);
  o += 4;
  view.setUint32(o, audio.sampleRate * blockAlign, true);
  o += 4;
  view.setUint16(o, blockAlign, true);
  o += 2;
  view.setUint16(o, bitDepth, true);
  o += 2;
  if (isFloat) {
    view.setUint16(o, 0, true); // cbSize
    o += 2;
  }

  writeString(view, o, 'data');
  o += 4;
  view.setUint32(o, dataSize, true);
  o += 4;

  for (let i = 0; i < frames; i++) {
    const L = audio.left[i] ?? 0;
    const R = audio.right[i] ?? 0;
    if (bitDepth === 16) {
      view.setInt16(o, floatToInt16(L, dither, random), true);
      o += 2;
      view.setInt16(o, floatToInt16(R, dither, random), true);
      o += 2;
    } else if (bitDepth === 24) {
      const write24 = (sample: number) => {
        const n = floatToInt24(sample, dither, random);
        view.setUint8(o, n & 0xff);
        view.setUint8(o + 1, (n >> 8) & 0xff);
        view.setUint8(o + 2, (n >> 16) & 0xff);
        o += 3;
      };
      write24(L);
      write24(R);
    } else {
      // float32 — transparent, no dither
      view.setFloat32(o, L, true);
      o += 4;
      view.setFloat32(o, R, true);
      o += 4;
    }
  }

  if (info) {
    new Uint8Array(buffer, o, info.byteLength).set(new Uint8Array(info));
  }

  return buffer;
}

/** Read basic header fields for tests. */
export function parseWavHeader(buf: ArrayBuffer): {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
} {
  const view = new DataView(buf);
  const str = (off: number, n: number) =>
    String.fromCharCode(...new Uint8Array(buf, off, n));
  if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') throw new Error('Not a WAV');
  let o = 12;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;
  while (o + 8 <= buf.byteLength) {
    const id = str(o, 4);
    const size = view.getUint32(o + 4, true);
    if (id === 'fmt ') {
      audioFormat = view.getUint16(o + 8, true);
      numChannels = view.getUint16(o + 10, true);
      sampleRate = view.getUint32(o + 12, true);
      bitsPerSample = view.getUint16(o + 22, true);
    } else if (id === 'data') {
      dataOffset = o + 8;
      dataSize = size;
      break;
    }
    o += 8 + size + (size % 2);
  }
  return { audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize };
}
