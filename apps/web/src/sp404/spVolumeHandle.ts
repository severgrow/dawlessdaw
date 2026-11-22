/**
 * Shared SP-404MKII SD volume handle (File System Access).
 *
 * Same picker id as Samples “Open SP volume…” (`dawlessdaw-sp404-sd`) so Chrome
 * can reuse the granted folder. Sessions needs readwrite to stage WAVs under
 * IMPORT/. PR #20’s Samples scan stays read-only when it opens the same id.
 *
 * Writes only into IMPORT/ — never SMPL/, PADCONF, or BKUP.
 *
 * Common failure modes this module guards against:
 * - User grants the IMPORT folder itself → write into it (don’t nest IMPORT/IMPORT/).
 * - Read-only grant from Samples → re-prompt with readwrite.
 * - Page reload → restore directory handle from IndexedDB.
 * - Silent write failures → verify byte length after close.
 */

import {
  IMPORT_DIR_NAME,
  importRelativePath,
  importWavFileName,
  isImportDirName,
  resolveImportDirName,
  type SpPadRef,
} from './spImportPath';
import { EXPORT_SAMPLE_RATE, encodeWav16, type PadAudio } from './samplePrep';
import type { StereoAudio } from '../recorder/types';

/** Same id Samples uses in PR #20 — keep in sync when that merges. */
export const SP_VOLUME_PICKER_ID = 'dawlessdaw-sp404-sd';

/** Chrome / Edge only — Safari & Firefox lack showDirectoryPicker. */
export const SP_VOLUME_BROWSER_HINT =
  'SP SD write needs Chrome or Edge (File System Access). Safari and Firefox cannot grant the card.';

const VOLUME_DB = 'dawlessdaw-sp404-volume';
const VOLUME_STORE = 'handles';
const VOLUME_KEY = 'sp-sd';

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
  getFile?: () => Promise<{ size: number; name: string }>;
};

type FsHandle = FsDirectoryHandle | FsFileHandle;

export type VolumeGrantKind = 'sp-root' | 'import-folder' | 'unknown';

export interface VolumeGrantInfo {
  kind: VolumeGrantKind;
  topNames: string[];
  /** Human hint when the grant is ambiguous. */
  warning: string | null;
}

export type PickSpVolumeResult =
  | { ok: true; handle: FsDirectoryHandle; info: VolumeGrantInfo }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'denied' | 'error'; message: string };

export class SpVolumeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SpVolumeError';
    this.code = code;
  }
}

/** Module cache shared across Sessions (and Samples when it imports this). */
let cachedVolume: FsDirectoryHandle | null = null;

export function getCachedSpVolumeHandle(): FsDirectoryHandle | null {
  return cachedVolume;
}

export function setCachedSpVolumeHandle(handle: FsDirectoryHandle | null): void {
  cachedVolume = handle;
  if (handle) void persistVolumeHandle(handle);
  else void clearPersistedVolumeHandle();
}

export function clearCachedSpVolumeHandle(): void {
  cachedVolume = null;
  void clearPersistedVolumeHandle();
}

export function fileSystemAccessSupported(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  );
}

function openVolumeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const req = indexedDB.open(VOLUME_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(VOLUME_STORE)) {
        req.result.createObjectStore(VOLUME_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function persistVolumeHandle(handle: FsDirectoryHandle): Promise<void> {
  try {
    const db = await openVolumeDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VOLUME_STORE, 'readwrite');
        tx.objectStore(VOLUME_STORE).put(handle, VOLUME_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('persist failed'));
        tx.onabort = () => reject(tx.error ?? new Error('persist aborted'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Private mode / blocked storage — in-memory cache still works this session.
  }
}

async function clearPersistedVolumeHandle(): Promise<void> {
  try {
    const db = await openVolumeDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VOLUME_STORE, 'readwrite');
        tx.objectStore(VOLUME_STORE).delete(VOLUME_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
        tx.onabort = () => reject(tx.error ?? new Error('clear aborted'));
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

/** Restore a previously granted volume from IndexedDB into the module cache. */
export async function restorePersistedSpVolumeHandle(): Promise<FsDirectoryHandle | null> {
  if (cachedVolume) return cachedVolume;
  if (!fileSystemAccessSupported()) return null;
  try {
    const db = await openVolumeDb();
    try {
      const handle = await new Promise<FsDirectoryHandle | null>((resolve, reject) => {
        const tx = db.transaction(VOLUME_STORE, 'readonly');
        const req = tx.objectStore(VOLUME_STORE).get(VOLUME_KEY);
        tx.oncomplete = () => resolve((req.result as FsDirectoryHandle | undefined) ?? null);
        tx.onerror = () => reject(tx.error ?? new Error('restore failed'));
      });
      if (!handle || typeof handle.getDirectoryHandle !== 'function') return null;
      if (!(await ensureWritePermission(handle))) return null;
      cachedVolume = handle;
      return handle;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
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

export async function listTopLevelNames(root: FsDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const [name] of iterateChildren(root)) {
      names.push(name);
    }
  } catch {
    // Listing failed — caller can still try create.
  }
  return names;
}

/**
 * Classify what the user granted.
 * - `import-folder`: the handle itself is IMPORT (write WAVs here; don’t nest).
 * - `sp-root`: looks like a formatted SP card root (IMPORT / EXPORT / BKUP).
 * - `unknown`: e.g. Desktop or a PROJECT folder — we can still stage IMPORT/.
 */
export function classifyVolumeGrant(
  rootName: string,
  topNames: Iterable<string>,
): VolumeGrantInfo {
  if (isImportDirName(rootName)) {
    return {
      kind: 'import-folder',
      topNames: [...topNames],
      warning: null,
    };
  }
  const upper = new Set([...topNames].map((n) => n.trim().toUpperCase()));
  const hasImport = [...topNames].some((n) => isImportDirName(n));
  const looksLikeSp =
    hasImport || upper.has('EXPORT') || upper.has('BKUP') || upper.has('ROLAND');
  if (looksLikeSp) {
    return { kind: 'sp-root', topNames: [...topNames], warning: null };
  }
  return {
    kind: 'unknown',
    topNames: [...topNames],
    warning:
      'This folder doesn’t look like the SP SD card root (no IMPORT / EXPORT / BKUP). Prefer the card volume itself — or the IMPORT folder. Writing IMPORT/ here anyway.',
  };
}

export async function inspectVolumeGrant(root: FsDirectoryHandle): Promise<VolumeGrantInfo> {
  const topNames = await listTopLevelNames(root);
  return classifyVolumeGrant(root.name, topNames);
}

async function ensureWritePermission(handle: FsDirectoryHandle): Promise<boolean> {
  try {
    if (
      typeof handle.queryPermission !== 'function' &&
      typeof handle.requestPermission !== 'function'
    ) {
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

function pickFailure(e: unknown): PickSpVolumeResult {
  if (e instanceof DOMException || (e && typeof e === 'object' && 'name' in e)) {
    const name = String((e as { name?: string }).name ?? '');
    if (name === 'AbortError') {
      return { ok: false, reason: 'cancelled', message: 'SP volume picker cancelled.' };
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        ok: false,
        reason: 'denied',
        message:
          'Folder access denied. In Chrome, allow this site to edit files, then Open SP volume again and pick the SD card root (or its IMPORT folder).',
      };
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return {
    ok: false,
    reason: 'error',
    message: msg ? `Could not open SP volume: ${msg}` : 'Could not open SP volume.',
  };
}

/**
 * Prompt for the SP SD volume (or its IMPORT folder).
 * Requests readwrite so we can create files under IMPORT/.
 */
export async function pickSpVolumeDirectory(
  opts: { mode?: 'read' | 'readwrite' } = {},
): Promise<FsDirectoryHandle | null> {
  const result = await pickSpVolumeDirectoryDetailed(opts);
  return result.ok ? result.handle : null;
}

/** Same as {@link pickSpVolumeDirectory} but with a clear cancel / deny reason. */
export async function pickSpVolumeDirectoryDetailed(
  opts: { mode?: 'read' | 'readwrite' } = {},
): Promise<PickSpVolumeResult> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: {
      mode?: 'read' | 'readwrite';
      id?: string;
    }) => Promise<FsDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== 'function') {
    return { ok: false, reason: 'unsupported', message: SP_VOLUME_BROWSER_HINT };
  }
  try {
    const handle = await w.showDirectoryPicker({
      mode: opts.mode ?? 'readwrite',
      id: SP_VOLUME_PICKER_ID,
    });
    setCachedSpVolumeHandle(handle);
    const info = await inspectVolumeGrant(handle);
    return { ok: true, handle, info };
  } catch (e) {
    return pickFailure(e);
  }
}

/** Reuse cache (memory + IndexedDB), re-prompting for permission; open picker if none. */
export async function ensureSpVolumeHandle(): Promise<FsDirectoryHandle | null> {
  const detailed = await ensureSpVolumeHandleDetailed();
  return detailed.ok ? detailed.handle : null;
}

export async function ensureSpVolumeHandleDetailed(): Promise<PickSpVolumeResult> {
  if (!fileSystemAccessSupported()) {
    return { ok: false, reason: 'unsupported', message: SP_VOLUME_BROWSER_HINT };
  }
  if (!cachedVolume) {
    await restorePersistedSpVolumeHandle();
  }
  if (cachedVolume) {
    if (await ensureWritePermission(cachedVolume)) {
      const info = await inspectVolumeGrant(cachedVolume);
      return { ok: true, handle: cachedVolume, info };
    }
    // Stale read-only grant (e.g. Samples opened with mode:read) — drop and re-pick.
    cachedVolume = null;
    await clearPersistedVolumeHandle();
  }
  return pickSpVolumeDirectoryDetailed({ mode: 'readwrite' });
}

/**
 * Find or create the IMPORT directory under the granted volume root.
 * If the user granted the IMPORT folder itself, return that handle (no nesting).
 */
export async function ensureImportDirectory(
  root: FsDirectoryHandle,
): Promise<FsDirectoryHandle> {
  if (isImportDirName(root.name)) {
    return root;
  }
  const names = await listTopLevelNames(root);
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
  bytesWritten: number;
  grantKind: VolumeGrantKind;
}

/** Map low-level I/O failures into actionable copy. */
export function formatSpWriteError(e: unknown): string {
  if (e instanceof SpVolumeError) return e.message;
  if (e instanceof DOMException || (e && typeof e === 'object' && 'name' in e)) {
    const name = String((e as { name?: string }).name ?? '');
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Write permission denied for the SP volume. Click Open SP volume… and grant edit access to the SD card root (or IMPORT).';
    }
    if (name === 'AbortError') {
      return 'Write cancelled.';
    }
    if (name === 'NoModificationAllowedError' || name === 'InvalidModificationError') {
      return 'The card rejected the write (read-only mount or locked file). Re-insert the SD card, Open SP volume… again, and retry.';
    }
    if (name === 'NotFoundError') {
      return 'Folder missing on the card. Open SP volume… and pick the SD card root so IMPORT/ can be created.';
    }
    if (name === 'QuotaExceededError') {
      return 'Not enough free space on the SD card.';
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg || 'Could not write to the SP volume.';
}

/** Write a WAV into IMPORT/ as `A01 name.wav`, then verify the on-disk size. */
export async function writeWavToImport(
  root: FsDirectoryHandle,
  pad: SpPadRef,
  sampleName: string,
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<WriteImportResult> {
  if (!(await ensureWritePermission(root))) {
    throw new SpVolumeError(
      'permission',
      'Write permission denied for the SP volume. Grant access and try again.',
    );
  }
  const info = await inspectVolumeGrant(root);
  const importDir = await ensureImportDirectory(root);
  const fileName = importWavFileName(pad.bank, pad.pad, sampleName);
  const relativePath = isImportDirName(root.name)
    ? `${IMPORT_DIR_NAME}/${fileName}`
    : importRelativePath(pad.bank, pad.pad, sampleName);

  let buffer: ArrayBuffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (data instanceof Uint8Array) {
    buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
  } else {
    buffer = await data.arrayBuffer();
  }

  if (buffer.byteLength < 44) {
    throw new SpVolumeError('format', 'WAV buffer too small to be a valid PCM file.');
  }

  const fh = await importDir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  try {
    await writable.write(buffer);
  } finally {
    await writable.close();
  }

  // Verify the write landed (Chrome can report success while a remount drops data).
  if (typeof fh.getFile === 'function') {
    const written = await fh.getFile();
    if (written.size !== buffer.byteLength) {
      throw new SpVolumeError(
        'verify',
        `Wrote ${fileName} but size mismatch (expected ${buffer.byteLength} bytes, got ${written.size}). Re-insert the card and try again — or use the downloaded fallback.`,
      );
    }
  }

  return {
    relativePath,
    volumeName: root.name,
    fileName,
    bytesWritten: buffer.byteLength,
    grantKind: info.kind,
  };
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

/** Peek WAV fmt chunk: sample rate + bits/sample (for tests / verify). */
export function readWavFormat(buffer: ArrayBuffer): { sampleRate: number; bitsPerSample: number; channels: number } {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) {
    throw new SpVolumeError('format', 'WAV too short');
  }
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}
