/**
 * FLIP WAV export — reuses Session Recorder encodeWav (16/24).
 */
import { downloadBlob } from '../recorder/exportTake';
import { encodeWav } from '../recorder/wav';
import type { StereoAudio } from '../recorder/types';
import type { FlipClipMeta, FlipExportOpts } from './types';
import { chopEqual, renderFlipAudio, softEdge } from './process';

export function defaultFlipFilename(clip: FlipClipMeta, bitDepth: 16 | 24): string {
  const safe = clip.name.replace(/[^\w\-]+/g, '_').slice(0, 40);
  return `${safe}_${clip.bars}bar_${bitDepth}bit.wav`;
}

export async function exportFlipWav(
  source: StereoAudio,
  clip: FlipClipMeta,
  opts: Partial<FlipExportOpts> = {},
): Promise<{ filename: string; blob: Blob }> {
  const bitDepth = opts.wavBitDepth ?? 24;
  const filename = opts.filename ?? defaultFlipFilename(clip, bitDepth);
  let audio = renderFlipAudio(source, clip);
  if (clip.fadeInMs === 0 && clip.fadeOutMs === 0) {
    audio = softEdge(audio, 8);
  }
  const buffer = encodeWav(audio, bitDepth, {
    title: clip.name,
    bpm: String(Math.round(clip.bpm)),
    date: new Date(clip.createdAt).toISOString().slice(0, 10),
  });
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return { filename, blob };
}

export function downloadFlipWav(
  source: StereoAudio,
  clip: FlipClipMeta,
  opts?: Partial<FlipExportOpts>,
): Promise<string> {
  return exportFlipWav(source, clip, opts).then(({ filename, blob }) => {
    downloadBlob(blob, filename);
    return filename;
  });
}

export async function exportChopWavs(
  source: StereoAudio,
  clip: FlipClipMeta,
  bitDepth: 16 | 24 = 24,
): Promise<string[]> {
  if (!clip.chop) return [];
  const rendered = renderFlipAudio(source, clip);
  const parts = chopEqual(rendered, clip.chop.slices);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const filename = `${clip.name.replace(/[^\w\-]+/g, '_').slice(0, 32)}_slice${i + 1}.wav`;
    const buffer = encodeWav(part, bitDepth, {
      title: `${clip.name} slice ${i + 1}`,
      bpm: String(Math.round(clip.bpm)),
    });
    downloadBlob(new Blob([buffer], { type: 'audio/wav' }), filename);
    names.push(filename);
  }
  return names;
}
