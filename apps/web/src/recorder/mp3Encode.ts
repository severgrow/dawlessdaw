/**
 * MP3 encode via @breezystack/lamejs in a Web Worker (LGPL-3.0).
 * Also provides a sync path for unit tests (main-thread encode).
 */
import type { Mp3Mode } from './types';
import type { StereoAudio } from './types';

export interface Mp3EncodeRequest {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  mode: Mp3Mode;
  title?: string;
  date?: string;
  bpm?: string;
}

/**
 * lamejs cannot do true VBR. Map modes to CBR kbps honestly.
 * `v0` previously used 160 (too low) — now 320 CBR as the quality stand-in.
 */
export function mp3ModeToCbrKbps(_mode: Mp3Mode): number {
  // Both cbr320 and v0 → 320 CBR (lamejs has no VBR).
  return 320;
}

export function mp3ModeHonesty(mode: Mp3Mode): string {
  if (mode === 'v0') {
    return 'Requested V0 VBR — encoded as 320 kbps CBR (lamejs has no VBR).';
  }
  return '320 kbps CBR';
}

function floatToInt16PCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]!));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

/** Estimate MP3 duration from CBR bitrate and byte length (for tests). */
export function estimateMp3DurationSec(byteLength: number, bitrateKbps: number): number {
  if (bitrateKbps <= 0) return 0;
  return (byteLength * 8) / (bitrateKbps * 1000);
}

/**
 * Parse first MPEG frame header bitrate (kbps) for CBR files.
 * Returns null if not recognisable.
 */
export function readMp3BitrateKbps(buf: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < Math.min(bytes.length - 4, 8192); i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1]! & 0xe0) !== 0xe0) continue;
    const brIndex = (bytes[i + 2]! >> 4) & 0x0f;
    // MPEG1 Layer III bitrate table
    const table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const br = table[brIndex];
    if (br) return br;
  }
  return null;
}

/** Main-thread encode (tests / small clips). Prefer encodeMp3InWorker in UI. */
export async function encodeMp3Sync(req: Mp3EncodeRequest): Promise<ArrayBuffer> {
  const lamejs = await import('@breezystack/lamejs');
  const Mp3Encoder = lamejs.Mp3Encoder;
  // lamejs is CBR-only — `v0` is NOT true VBR. Use 320 kbps CBR as the high-quality stand-in.
  const kbps = mp3ModeToCbrKbps(req.mode);
  const encoder = new Mp3Encoder(2, req.sampleRate, kbps);
  const left = floatToInt16PCM(req.left);
  const right = floatToInt16PCM(req.right);
  const block = 1152;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const r = right.subarray(i, i + block);
    const buf = encoder.encodeBuffer(l, r);
    if (buf.length) parts.push(new Uint8Array(buf));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));

  // Optional ID3v2.3 header (title / TYER / TBPM)
  const id3 = buildId3v2({
    title: req.title,
    date: req.date,
    bpm: req.bpm,
  });

  let total = id3 ? id3.byteLength : 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  if (id3) {
    out.set(new Uint8Array(id3), 0);
    o = id3.byteLength;
  }
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

function buildId3v2(tags: { title?: string; date?: string; bpm?: string }): ArrayBuffer | null {
  const frames: Uint8Array[] = [];
  const pushText = (id: string, text: string) => {
    const enc = new TextEncoder().encode(text);
    // frame: id(4) size(4) flags(2) encoding(1) + text
    const body = new Uint8Array(1 + enc.length);
    body[0] = 0; // ISO-8859-1
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
  header[0] = 0x49; // I
  header[1] = 0x44; // D
  header[2] = 0x33; // 3
  header[3] = 3; // v2.3
  header[4] = 0;
  header[5] = 0;
  // synchsafe size
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

export function encodeMp3InWorker(
  req: Mp3EncodeRequest,
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type: string; progress?: number; buffer?: ArrayBuffer; error?: string };
      if (msg.type === 'progress' && typeof msg.progress === 'number') {
        onProgress?.(msg.progress);
      } else if (msg.type === 'done' && msg.buffer) {
        worker.terminate();
        resolve(msg.buffer);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error ?? 'MP3 encode failed'));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e.error ?? new Error('MP3 worker error'));
    };
    worker.postMessage(
      {
        type: 'encode',
        left: req.left,
        right: req.right,
        sampleRate: req.sampleRate,
        mode: req.mode,
        title: req.title,
        date: req.date,
        bpm: req.bpm,
      },
      [req.left.buffer, req.right.buffer],
    );
  });
}
