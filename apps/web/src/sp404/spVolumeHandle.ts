/**
 * Shared SP-404MKII SD volume handle (File System Access).
 *
 * Same picker id as Samples “Open SP volume…” (`dawlessdaw-sp404-sd`) so Chrome
 * can reuse the granted folder. Sessions needs readwrite to stage WAVs under
 * IMPORT/. PR #20’s Samples scan stays read-only when it opens the same id.
 *
 * Writes only into IMPORT/ — never SMPL/, PADCONF, or BKUP.
 */

import {
  IMPORT_DIR_NAME,
  importRelativePath,
  isImportDirName,
  resolveImportDirName,
  type SpPadRef,
} from './spImportPath';
import { EXPORT_SAMPLE_RATE, encodeWav16, type PadAudio } from './samplePrep';
import type { StereoAudio } from '../recorder/types';

/** Same id Samples uses in PR #20 — keep in sync when that merges. */
export const SP_VOLUME_PICKER_ID = 'dawlessdaw-sp404-sd';

export type FsDirectoryHandle = {
  name: string;
  kind?: string;
  entries?: () => AsyncIterableIterator<[string, FsHandle]>;
  values?: () => AsyncIterableIterator<FsHandle>;
  getDirectoryHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FsDirectoryHandle>;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FsFileHandle>;
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState | string>;
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState | string>;
};

type FsFileHandle = {
  name: string;
  kind?: string;
  createWritable: () => Promise<{
    write: (data: BufferSource | Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type FsHandle = FsDirectoryHandle | FsFileHandle;

/** Module cache shared across Sessions (and Samples when it imports this). */
let cachedVolume: FsDirectoryHandle | null = null;

export function getCachedSpVolumeHandle(): FsDirectoryHandle | null {
  return cachedVolume;
}

export function setCachedSpVolumeHandle(handle: FsDirectoryHandle | null): void {
  cachedVolume = handle;
}

export function clearCachedSpVolumeHandle(): void {
  cachedVolume = null;
}

export function fileSystemAccessSupported(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  );
}

async function* iterateChildren(
  dir: FsDirectoryHandle,
): AsyncGenerator<[string, FsHandle]> {
  if (typeof dir.entries === 'function') {
    for await (const entry of dir.entries()) yield entry;
    return;
  }
  if (typeof dir.values === 'function') {
    for await (const handle of dir.values()) {
      yield [handle.name, handle];
    }
  }
}

async function ensureWritePermission(handle: FsDirectoryHandle): Promise<boolean> {
  try {
    if (typeof handle.queryPermission !== 'function' && typeof handle.requestPermission !== 'function') {
      // No permission API on the handle — try the write and let I/O fail if needed.
      return true;
    }
    const q = await handle.queryPermission?.({ mode: 'readwrite' });
    if (q === 'granted') return true;
    if (typeof handle.requestPermission !== 'function') return q !== 'denied';
    const r = await handle.requestPermission({ mode: 'readwrite' });
    return r === 'granted';
  } catch {
    // Older Chromium / missing methods — try the write and let it fail.
    return true;
  }
}

/**
 * Prompt for the SP SD volume (or any folder that should receive IMPORT/).
 * Requests readwrite so we can create files under IMPORT/.
 */
export async function pickSpVolumeDirectory(
  opts: { mode?: 'read' | 'readwrite' } = {},
): Promise<FsDirectoryHandle | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: {
      mode?: 'read' | 'readwrite';
      id?: string;
    }) => Promise<FsDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== 'function') return null;
  try {
    const handle = await w.showDirectoryPicker({
      mode: opts.mode ?? 'readwrite',
      id: SP_VOLUME_PICKER_ID,
    });
    setCachedSpVolumeHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

/** Reuse cache, re-prompting for permission; open picker if none. */
export async function ensureSpVolumeHandle(): Promise<FsDirectoryHandle | null> {
  if (!fileSystemAccessSupported()) return null;
  if (cachedVolume) {
    if (await ensureWritePermission(cachedVolume)) return cachedVolume;
  }
  return pickSpVolumeDirectory({ mode: 'readwrite' });
}

/** Find or create the IMPORT directory under the granted volume root. */
export async function ensureImportDirectory(
  root: FsDirectoryHandle,
): Promise<FsDirectoryHandle> {
  const names: string[] = [];
  try {
    for await (const [name] of iterateChildren(root)) {
      names.push(name);
    }
  } catch {
    // Listing failed — still try canonical create.
  }
  const prefer = resolveImportDirName(names);
  if (names.some((n) => isImportDirName(n))) {
    return root.getDirectoryHandle(prefer);
  }
  return root.getDirectoryHandle(IMPORT_DIR_NAME, { create: true });
}

export interface WriteImportResult {
  relativePath: string;
  volumeName: string;
  fileName: string;
}

/** Write a WAV blob into IMPORT/ as `A01 name.wav`. */
export async function writeWavToImport(
  root: FsDirectoryHandle,
  pad: SpPadRef,
  sampleName: string,
  blob: Blob,
): Promise<WriteImportResult> {
  if (!(await ensureWritePermission(root))) {
    throw new Error('Write permission denied for the SP volume. Grant access and try again.');
  }
  const importDir = await ensureImportDirectory(root);
  const relativePath = importRelativePath(pad.bank, pad.pad, sampleName);
  const fileName = relativePath.slice(IMPORT_DIR_NAME.length + 1);
  const fh = await importDir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
  return { relativePath, volumeName: root.name, fileName };
}

/** Resample stereo PCM to 48 kHz via OfflineAudioContext (browser). */
export async function resampleStereoTo48k(audio: StereoAudio): Promise<PadAudio> {
  const frames = Math.min(audio.left.length, audio.right.length);
  if (frames === 0) {
    return { sampleRate: EXPORT_SAMPLE_RATE, channels: [new Float32Array(0), new Float32Array(0)] };
  }
  if (audio.sampleRate === EXPORT_SAMPLE_RATE) {
    return {
      sampleRate: EXPORT_SAMPLE_RATE,
      channels: [audio.left.slice(0, frames), audio.right.slice(0, frames)],
    };
  }
  const outFrames = Math.max(1, Math.ceil((frames * EXPORT_SAMPLE_RATE) / audio.sampleRate));
  const ctx = new OfflineAudioContext(2, outFrames, EXPORT_SAMPLE_RATE);
  const src = ctx.createBuffer(2, frames, audio.sampleRate);
  src.copyToChannel(new Float32Array(audio.left.subarray(0, frames)), 0);
  src.copyToChannel(new Float32Array(audio.right.subarray(0, frames)), 1);
  const node = ctx.createBufferSource();
  node.buffer = src;
  node.connect(ctx.destination);
  node.start();
  const out = await ctx.startRendering();
  return {
    sampleRate: EXPORT_SAMPLE_RATE,
    channels: [
      new Float32Array(out.getChannelData(0)),
      new Float32Array(out.getChannelData(1)),
    ],
  };
}

/** Encode a take region as SP-ready 48 kHz / 16-bit stereo WAV. */
export async function encodeSpReadyWav(audio: StereoAudio): Promise<ArrayBuffer> {
  const padAudio = await resampleStereoTo48k(audio);
  return encodeWav16(padAudio);
}
