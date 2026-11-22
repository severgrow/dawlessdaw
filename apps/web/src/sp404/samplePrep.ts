/**
 * SP-404MKII sample prep — pure helpers (no browser APIs), so they can be unit-tested.
 *
 * Safe by design: this never touches the SP's own project files. It only makes plain
 * WAV files you copy to the SD card and import on the SP yourself.
 */

export const SP_BANKS = ['A', 'B', 'C', 'D'] as const;
export type SpBank = (typeof SP_BANKS)[number];
export const PADS_PER_BANK = 16;
/** Export format: 48 kHz, 16-bit PCM WAV (the SP-404MKII's native rate). */
export const EXPORT_SAMPLE_RATE = 48000;
const MAX_NAME_LENGTH = 24;

export interface PadAudio {
  /** One Float32Array per channel (1 = mono, 2 = stereo), values −1…1 */
  channels: Float32Array[];
  sampleRate: number;
}

export interface PadEdit {
  name: string;
  /** Seconds from the start of the source */
  trimStart: number;
  /** Seconds from the start of the source; null = to the end */
  trimEnd: number | null;
  normalize: boolean;
}

export function padKey(bank: SpBank, pad: number): string {
  return `${bank}${String(pad).padStart(2, '0')}`;
}

/** Clean a sample name: plain ASCII, no path characters, short enough for the SP screen. */
export function cleanSampleName(raw: string): string {
  const withoutExt = raw.replace(/\.[a-z0-9]{2,4}$/i, '');
  const ascii = withoutExt
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (ascii || 'sample').slice(0, MAX_NAME_LENGTH).trim();
}

/** e.g. "A01 kick.wav" — sorts by bank and pad in any file browser. */
export function padFileName(bank: SpBank, pad: number, name: string): string {
  return `${padKey(bank, pad)} ${cleanSampleName(name)}.wav`;
}

export function durationSeconds(audio: PadAudio): number {
  const len = audio.channels[0]?.length ?? 0;
  return audio.sampleRate > 0 ? len / audio.sampleRate : 0;
}

/** Cut each channel to [start, end) seconds. Out-of-range values are clamped. */
export function trimAudio(audio: PadAudio, startSec: number, endSec: number | null): PadAudio {
  const len = audio.channels[0]?.length ?? 0;
  const toIndex = (sec: number) =>
    Math.max(0, Math.min(len, Math.round(sec * audio.sampleRate)));
  const start = toIndex(startSec);
  const end = endSec == null ? len : Math.max(start, toIndex(endSec));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((c) => c.slice(start, end)),
  };
}

/** Scale so the loudest sample hits `target` (default ≈ −0.2 dBFS). Silence is left alone. */
export function normalizePeak(audio: PadAudio, target = 0.977): PadAudio {
  let peak = 0;
  for (const c of audio.channels) {
    for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i]!);
      if (v > peak) peak = v;
    }
  }
  if (peak === 0) return audio;
  const gain = target / peak;
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((c) => c.map((v) => v * gain)),
  };
}

/** Apply trim then (optionally) normalize. */
export function applyEdit(audio: PadAudio, edit: PadEdit): PadAudio {
  const trimmed = trimAudio(audio, edit.trimStart, edit.trimEnd);
  return edit.normalize ? normalizePeak(trimmed) : trimmed;
}

/** Encode 16-bit PCM WAV (mono or stereo). */
export function encodeWav16(audio: PadAudio): ArrayBuffer {
  const numChannels = Math.max(1, Math.min(2, audio.channels.length));
  const frames = audio.channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataSize = frames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const v = Math.max(-1, Math.min(1, audio.channels[ch]![i] ?? 0));
      view.setInt16(offset, v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff), true);
      offset += 2;
    }
  }
  return buffer;
}

/** Peak per bucket for drawing a simple waveform. */
export function waveformPeaks(audio: PadAudio, buckets: number): number[] {
  const len = audio.channels[0]?.length ?? 0;
  if (len === 0 || buckets <= 0) return [];
  const size = Math.max(1, Math.floor(len / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * size;
    const end = Math.min(len, start + size);
    for (const c of audio.channels) {
      for (let i = start; i < end; i++) {
        const v = Math.abs(c[i]!);
        if (v > peak) peak = v;
      }
    }
    peaks.push(peak);
  }
  return peaks;
}
