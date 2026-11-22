/** RFWV header parse + BE→LE PCM + WAV encode (open404-compatible). */

import { RFWV_HEADER_LEN } from './constants';

export type RfwvHeader = {
  chunkSize: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
};

function u32be(data: Uint8Array, offset: number): number {
  return (
    ((data[offset]! << 24) |
      (data[offset + 1]! << 16) |
      (data[offset + 2]! << 8) |
      data[offset + 3]!) >>>
    0
  );
}

export function parseRfwvHeader(data: Uint8Array): RfwvHeader {
  if (data.length < RFWV_HEADER_LEN) throw new Error(`RFWV header too short (${data.length})`);
  if (data[0] !== 0x52 || data[1] !== 0x46 || data[2] !== 0x57 || data[3] !== 0x56) {
    throw new Error('invalid RFWV magic');
  }
  return {
    chunkSize: u32be(data, 4),
    sampleRate: u32be(data, 8),
    channels: u32be(data, 12),
    bitDepth: u32be(data, 16),
  };
}

/** PCM byte length from RFWV (open404: chunkSize - 512 + 8). */
export function rfwvPcmByteLength(hdr: RfwvHeader): number {
  return Math.max(0, hdr.chunkSize - RFWV_HEADER_LEN + 8);
}

export function swapEndian16(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    out[i] = pcm[i + 1]!;
    out[i + 1] = pcm[i]!;
  }
  return out;
}

function writeU32le(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function writeU16le(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

/** Encode host little-endian 16-bit PCM as a standard RIFF/WAV. */
export function encodeWav16(pcmLe: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  if (channels !== 1 && channels !== 2) throw new Error('channels must be 1 or 2');
  const dataSize = pcmLe.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  writeU32le(view, 4, 36 + dataSize);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  writeU32le(view, 16, 16);
  writeU16le(view, 20, 1);
  writeU16le(view, 22, channels);
  writeU32le(view, 24, sampleRate);
  writeU32le(view, 28, byteRate);
  writeU16le(view, 32, blockAlign);
  writeU16le(view, 34, 16);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // data
  writeU32le(view, 40, dataSize);
  bytes.set(pcmLe, 44);
  return bytes;
}

export function rfwvStreamToWav(raw: Uint8Array): {
  wav: Uint8Array;
  header: RfwvHeader;
  pcmBytes: number;
} {
  const header = parseRfwvHeader(raw.subarray(0, RFWV_HEADER_LEN));
  const pcmLen = rfwvPcmByteLength(header);
  let pcm = raw.subarray(RFWV_HEADER_LEN, RFWV_HEADER_LEN + pcmLen);
  if (pcm.length < pcmLen) {
    // tolerate short streams — use what we have
    pcm = raw.subarray(RFWV_HEADER_LEN);
  }
  const hostPcm = swapEndian16(pcm);
  const wav = encodeWav16(hostPcm, header.sampleRate || 48000, header.channels || 1);
  return { wav, header, pcmBytes: hostPcm.length };
}
