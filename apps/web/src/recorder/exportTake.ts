/**
 * Export trimmed regions as WAV / MP3. Trim never mutates the stored take.
 */
import { prepareForExport, splitRegionsAtMarkers } from './pcmMath';
import { encodeWav } from './wav';
import { encodeMp3InWorker, encodeMp3Sync } from './mp3Encode';
import { renderFilename, DEFAULT_FILENAME_PATTERN } from './filename';
import type { ExportOptions, StereoAudio, TakeMeta, WavBitDepth, Mp3Mode } from './types';

export { DEFAULT_FILENAME_PATTERN };

export interface ExportProgress {
  ratio: number;
  label: string;
}

export interface ExportResult {
  filename: string;
  blob: Blob;
  mime: string;
}

function tagsFor(meta: TakeMeta) {
  return {
    title: meta.name,
    date: meta.tags.recordedAt.slice(0, 10),
    bpm: meta.tags.tempoBpm != null ? String(Math.round(meta.tags.tempoBpm)) : undefined,
  };
}

async function encodeOne(
  audio: StereoAudio,
  meta: TakeMeta,
  format: 'wav' | 'mp3',
  wavBitDepth: WavBitDepth,
  mp3Mode: Mp3Mode,
  onProgress?: (r: number) => void,
  useWorker = true,
): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const t = tagsFor(meta);
  if (format === 'wav') {
    onProgress?.(0.5);
    const buffer = encodeWav(audio, wavBitDepth, t);
    onProgress?.(1);
    return { buffer, mime: 'audio/wav' };
  }
  const req = {
    left: audio.left,
    right: audio.right,
    sampleRate: audio.sampleRate,
    mode: mp3Mode,
    title: t.title,
    date: t.date,
    bpm: t.bpm,
  };
  const buffer = useWorker
    ? await encodeMp3InWorker(req, onProgress)
    : await encodeMp3Sync(req);
  return { buffer, mime: 'audio/mpeg' };
}

export async function exportTake(
  meta: TakeMeta,
  source: StereoAudio,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
  useWorker = true,
): Promise<ExportResult[]> {
  const wavBitDepth = options.wavBitDepth ?? 24;
  const mp3Mode = options.mp3Mode ?? 'cbr320';
  const regions = options.splitAtMarkers
    ? splitRegionsAtMarkers(options.trim.startFrame, options.trim.endFrame, meta.markers)
    : [
        {
          startFrame: options.trim.startFrame,
          endFrame: options.trim.endFrame,
          label: 'full',
        },
      ];

  const results: ExportResult[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]!;
    onProgress?.({
      ratio: i / regions.length,
      label: `Preparing ${region.label}…`,
    });
    const prepared = prepareForExport(source, {
      ...options.trim,
      startFrame: region.startFrame,
      endFrame: region.endFrame,
    });
    const { buffer, mime } = await encodeOne(
      prepared,
      meta,
      options.format,
      wavBitDepth,
      mp3Mode,
      (r) =>
        onProgress?.({
          ratio: (i + r) / regions.length,
          label: `Encoding ${region.label}…`,
        }),
      useWorker,
    );
    const filename = renderFilename(options.filename || DEFAULT_FILENAME_PATTERN, {
      date: new Date(meta.createdAt),
      name: meta.name,
      bpm: meta.tags.tempoBpm,
      ext: options.format,
      part: options.splitAtMarkers && regions.length > 1 ? region.label : undefined,
    });
    results.push({
      filename,
      blob: new Blob([buffer], { type: mime }),
      mime,
    });
  }
  onProgress?.({ ratio: 1, label: 'Done' });
  return results;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type DirectoryHandle = {
  getFileHandle: (
    name: string,
    opts: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

export async function saveBlobsToFolder(
  results: ExportResult[],
): Promise<'saved' | 'cancelled' | 'unsupported'> {
  const w = window as Window & {
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== 'function') return 'unsupported';
  try {
    const dir = await w.showDirectoryPicker();
    for (const r of results) {
      const fh = await dir.getFileHandle(r.filename, { create: true });
      const writable = await fh.createWritable();
      await writable.write(r.blob);
      await writable.close();
    }
    return 'saved';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}
