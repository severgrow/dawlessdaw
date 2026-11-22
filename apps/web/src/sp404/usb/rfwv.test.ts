import { describe, expect, it } from 'vitest';
import { RFWV_HEADER_LEN } from './constants';
import {
  encodeWav16,
  parseRfwvHeader,
  rfwvPcmByteLength,
  rfwvStreamToWav,
  swapEndian16,
} from './rfwv';

function buildRfwv(pcmBe: Uint8Array, sampleRate = 48000, channels = 1): Uint8Array {
  const hdr = new Uint8Array(RFWV_HEADER_LEN);
  hdr.set([0x52, 0x46, 0x57, 0x56], 0); // RFWV
  const chunkSize = RFWV_HEADER_LEN - 8 + pcmBe.length;
  const dv = new DataView(hdr.buffer);
  dv.setUint32(4, chunkSize, false);
  dv.setUint32(8, sampleRate, false);
  dv.setUint32(12, channels, false);
  dv.setUint32(16, 16, false);
  const out = new Uint8Array(RFWV_HEADER_LEN + pcmBe.length);
  out.set(hdr, 0);
  out.set(pcmBe, RFWV_HEADER_LEN);
  return out;
}

describe('RFWV → WAV', () => {
  it('parses header and PCM length', () => {
    const pcm = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const raw = buildRfwv(pcm);
    const hdr = parseRfwvHeader(raw);
    expect(hdr.sampleRate).toBe(48000);
    expect(hdr.channels).toBe(1);
    expect(hdr.bitDepth).toBe(16);
    expect(rfwvPcmByteLength(hdr)).toBe(4);
  });

  it('byte-swaps BE PCM and wraps WAV', () => {
    const pcmBe = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect([...swapEndian16(pcmBe)]).toEqual([0x34, 0x12, 0x78, 0x56]);
    const { wav, header } = rfwvStreamToWav(buildRfwv(pcmBe, 48000, 1));
    expect(header.sampleRate).toBe(48000);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    // data payload starts at 44
    expect([...wav.subarray(44, 48)]).toEqual([0x34, 0x12, 0x78, 0x56]);
  });

  it('encodeWav16 writes mono PCM size', () => {
    const pcm = new Uint8Array([0x00, 0x01, 0x00, 0x02]);
    const wav = encodeWav16(pcm, 48000, 1);
    const dv = new DataView(wav.buffer);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getUint32(40, true)).toBe(4);
  });
});
