/// <reference lib="webworker" />
/**
 * Web Worker MP3 encoder — @breezystack/lamejs (LGPL-3.0).
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Mp3Mode } from './types';

function floatToInt16PCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]!));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

function buildId3v2(tags: { title?: string; date?: string; bpm?: string }): ArrayBuffer | null {
  const frames: Uint8Array[] = [];
  const pushText = (id: string, text: string) => {
    const enc = new TextEncoder().encode(text);
    const body = new Uint8Array(1 + enc.length);
    body[0] = 0;
    body.set(enc, 1);
    const frame = new Uint8Array(10 + body.length);
    for (let i = 0; i < 4; i++) frame[i] = id.charCodeAt(i);
    const size = body.length;
    frame[4] = (size >> 24) & 0xff;
    frame[5] = (size >> 16) & 0xff;
    frame[6] = (size >> 8) & 0xff;
    frame[7] = size & 0xff;
    frame.set(body, 10);
    frames.push(frame);
  };
  if (tags.title) pushText('TIT2', tags.title.slice(0, 60));
  if (tags.date) pushText('TYER', tags.date.slice(0, 4));
  if (tags.bpm) pushText('TBPM', tags.bpm);
  if (!frames.length) return null;
  let frameBytes = 0;
  for (const f of frames) frameBytes += f.length;
  const header = new Uint8Array(10);
  header.set([0x49, 0x44, 0x33, 3, 0, 0]);
  const s = frameBytes;
  header[6] = (s >> 21) & 0x7f;
  header[7] = (s >> 14) & 0x7f;
  header[8] = (s >> 7) & 0x7f;
  header[9] = s & 0x7f;
  const out = new Uint8Array(10 + frameBytes);
  out.set(header, 0);
  let o = 10;
  for (const f of frames) {
    out.set(f, o);
    o += f.length;
  }
  return out.buffer;
}

self.onmessage = (ev: MessageEvent) => {
  const data = ev.data as {
    type: string;
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    mode: Mp3Mode;
    title?: string;
    date?: string;
    bpm?: string;
  };
  if (data.type !== 'encode') return;
  try {
    const kbps = data.mode === 'cbr320' ? 320 : 160;
    const encoder = new Mp3Encoder(2, data.sampleRate, kbps);
    const left = floatToInt16PCM(data.left);
    const right = floatToInt16PCM(data.right);
    const block = 1152;
    const parts: Uint8Array[] = [];
    const total = left.length;
    for (let i = 0; i < total; i += block) {
      const buf = encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
      if (buf.length) parts.push(new Uint8Array(buf));
      if (i % (block * 32) === 0) {
        self.postMessage({ type: 'progress', progress: Math.min(1, i / total) });
      }
    }
    const tail = encoder.flush();
    if (tail.length) parts.push(new Uint8Array(tail));
    const id3 = buildId3v2({ title: data.title, date: data.date, bpm: data.bpm });
    let size = id3 ? id3.byteLength : 0;
    for (const p of parts) size += p.length;
    const out = new Uint8Array(size);
    let o = 0;
    if (id3) {
      out.set(new Uint8Array(id3), 0);
      o = id3.byteLength;
    }
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    self.postMessage({ type: 'progress', progress: 1 });
    self.postMessage({ type: 'done', buffer: out.buffer }, [out.buffer]);
  } catch (e) {
    self.postMessage({
      type: 'error',
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
