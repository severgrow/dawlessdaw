import type { MpcLibraryEntry } from './contract';

/**
 * Synthetic fixture payloads for Phase E backup / FLIP import.
 * Invented content only — not from expansion-builder. No normalize / gain staging.
 */

const SAMPLE_RATE = 48000;

/** Tiny mono→stereo PCM (−12 dBFS tone, not normalized). */
export function fixtureSamplePcm(
  entry: Pick<MpcLibraryEntry, 'id' | 'name'>,
  seconds = 0.25,
): { sampleRate: number; left: Float32Array; right: Float32Array } {
  const frames = Math.max(1, Math.floor(SAMPLE_RATE * seconds));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  // Deterministic freq from id hash — amplitude fixed (no auto-norm).
  let h = 0;
  for (let i = 0; i < entry.id.length; i++) h = (h * 31 + entry.id.charCodeAt(i)) | 0;
  const freq = 110 + (Math.abs(h) % 400);
  const amp = 0.25; // −12 dBFS-ish; never peak-normalize
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * amp;
    left[i] = s;
    right[i] = s * 0.96;
  }
  return { sampleRate: SAMPLE_RATE, left, right };
}

/** Encode PCM as 16-bit WAV bytes (little-endian). */
export function encodePcm16Wav(audio: {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}): Uint8Array {
  const frames = Math.min(audio.left.length, audio.right.length);
  const dataSize = frames * 2 * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, audio.left[i]!));
    const r = Math.max(-1, Math.min(1, audio.right[i]!));
    view.setInt16(o, (l * 0x7fff) | 0, true);
    view.setInt16(o + 2, (r * 0x7fff) | 0, true);
    o += 4;
  }
  return new Uint8Array(buf);
}

/** Stub project / folder file for backup (UTF-8 text — not a real Akai XPJ). */
export function fixtureProjectStubBytes(entry: MpcLibraryEntry): Uint8Array {
  const text = [
    '# Splot MPC Library fixture stub — not a real MPC project file',
    `# name: ${entry.name}`,
    `# path: ${entry.relativePath}`,
    `# id: ${entry.id}`,
    '# Phase E backup PoC — invented content only',
    '',
  ].join('\n');
  return new TextEncoder().encode(text);
}

export function fixtureBytesForEntry(entry: MpcLibraryEntry): Uint8Array {
  if (entry.kind === 'sample') {
    return encodePcm16Wav(fixtureSamplePcm(entry));
  }
  return fixtureProjectStubBytes(entry);
}
