/**
 * IndexedDB persistence for Session Recorder takes + in-progress chunks.
 * Local to this browser profile only — never uploaded.
 */
import type { TakeMarker, TakeMeta, TakeTags } from './types';
import { stitchChunks, type PcmChunk } from './stitch';
import type { StereoAudio } from './types';
import { commitTakeKeepingRecovery, type TakeCommitPhase } from './takeCommit';


const DB_NAME = 'dawlessdaw-session-recorder';
const DB_VERSION = 1;
const TAKES = 'takes';
const CHUNKS = 'chunks';
const DRAFT = 'draft';

export interface StoredTake extends TakeMeta {
  /** Interleaved stereo Float32 as transferable ArrayBuffer */
  pcm: ArrayBuffer;
}

export interface DraftState {
  id: 'active';
  takeId: string;
  meta: TakeMeta;
  nextChunkIndex: number;
  startedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TAKES)) {
        db.createObjectStore(TAKES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const store = db.createObjectStore(CHUNKS, { keyPath: ['takeId', 'index'] });
        store.createIndex('byTake', 'takeId', { unique: false });
      }
      if (!db.objectStoreNames.contains(DRAFT)) {
        db.createObjectStore(DRAFT, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listTakes(): Promise<TakeMeta[]> {
  try {
    const all = (await withStore<StoredTake[]>('takes', 'readonly', (s) => s.getAll())) ?? [];
    return all
      .map(({ pcm: _pcm, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function loadTakeAudio(id: string): Promise<StereoAudio | null> {
  try {
    const take = await withStore<StoredTake>('takes', 'readonly', (s) => s.get(id));
    if (!take?.pcm) return null;
    const interleaved = new Float32Array(take.pcm);
    const frames = Math.floor(interleaved.length / 2);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = interleaved[i * 2]!;
      right[i] = interleaved[i * 2 + 1]!;
    }
    return { sampleRate: take.sampleRate, left, right };
  } catch {
    return null;
  }
}

export async function loadTakeMeta(id: string): Promise<TakeMeta | null> {
  try {
    const take = await withStore<StoredTake>('takes', 'readonly', (s) => s.get(id));
    if (!take) return null;
    const { pcm: _p, ...meta } = take;
    return meta;
  } catch {
    return null;
  }
}

export async function saveCompleteTake(
  meta: TakeMeta,
  audio: StereoAudio,
): Promise<boolean> {
  try {
    const frames = Math.min(audio.left.length, audio.right.length);
    const interleaved = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      interleaved[i * 2] = audio.left[i]!;
      interleaved[i * 2 + 1] = audio.right[i]!;
    }
    const stored: StoredTake = {
      ...meta,
      frameCount: frames,
      durationSec: frames / audio.sampleRate,
      incomplete: false,
      pcm: interleaved.buffer.slice(0),
    };
    await withStore('takes', 'readwrite', (s) => {
      s.put(stored);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist take, verify read-back, then clear draft/chunks.
 * On save/verify failure recovery is left intact (P1).
 */
export async function finalizeCompleteTake(
  meta: TakeMeta,
  audio: StereoAudio,
): Promise<TakeCommitPhase> {
  return commitTakeKeepingRecovery({
    save: () => saveCompleteTake(meta, audio),
    verify: async () => {
      const loaded = await loadTakeMeta(meta.id);
      if (!loaded || loaded.frameCount <= 0) return false;
      const pcm = await loadTakeAudio(meta.id);
      return pcm !== null && pcm.left.length > 0;
    },
    clearRecovery: async () => {
      await clearChunks(meta.id);
      await clearDraft();
    },
  });
}

export async function updateTakeMeta(id: string, patch: Partial<TakeMeta>): Promise<boolean> {
  try {
    const take = await withStore<StoredTake>('takes', 'readonly', (s) => s.get(id));
    if (!take) return false;
    const next = { ...take, ...patch, id };
    await withStore('takes', 'readwrite', (s) => {
      s.put(next);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteTake(id: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([TAKES, CHUNKS, DRAFT], 'readwrite');
        tx.objectStore(TAKES).delete(id);
        const chunkStore = tx.objectStore(CHUNKS);
        const idx = chunkStore.index('byTake');
        const req = idx.openCursor(IDBKeyRange.only(id));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      const draft = await getDraft();
      if (draft?.takeId === id) await clearDraft();
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

export async function beginDraft(meta: TakeMeta): Promise<void> {
  const draft: DraftState = {
    id: 'active',
    takeId: meta.id,
    meta,
    nextChunkIndex: 0,
    startedAt: Date.now(),
  };
  await withStore('draft', 'readwrite', (s) => {
    s.put(draft);
  });
}

export async function appendChunk(takeId: string, index: number, samples: Float32Array): Promise<void> {
  await appendChunksBatch(takeId, [{ index, samples }]);
}

/**
 * One IndexedDB transaction for many chunks (P3 batched persist).
 * Updates draft nextChunkIndex to max(index)+1 when a draft is active.
 */
export async function appendChunksBatch(takeId: string, chunks: PcmChunk[]): Promise<void> {
  if (!chunks.length) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CHUNKS, DRAFT], 'readwrite');
      const chunkStore = tx.objectStore(CHUNKS);
      let maxIndex = -1;
      for (const c of chunks) {
        maxIndex = Math.max(maxIndex, c.index);
        const samples = c.samples;
        chunkStore.put({
          takeId,
          index: c.index,
          samples: samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength),
        });
      }
      const draftReq = tx.objectStore(DRAFT).get('active');
      draftReq.onsuccess = () => {
        const draft = draftReq.result as DraftState | undefined;
        if (draft && draft.takeId === takeId && maxIndex >= 0) {
          tx.objectStore(DRAFT).put({
            ...draft,
            nextChunkIndex: Math.max(draft.nextChunkIndex, maxIndex + 1),
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('appendChunksBatch failed'));
      tx.onabort = () => reject(tx.error ?? new Error('appendChunksBatch aborted'));
    });
  } finally {
    db.close();
  }
}

export async function getDraft(): Promise<DraftState | null> {
  try {
    return (await withStore<DraftState>('draft', 'readonly', (s) => s.get('active'))) ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await withStore('draft', 'readwrite', (s) => {
      s.delete('active');
    });
  } catch {
    // ignore
  }
}

export async function loadChunks(takeId: string): Promise<PcmChunk[]> {
  try {
    const db = await openDb();
    try {
      return await new Promise<PcmChunk[]>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, 'readonly');
        const idx = tx.objectStore(CHUNKS).index('byTake');
        const req = idx.getAll(IDBKeyRange.only(takeId));
        req.onsuccess = () => {
          const rows = (req.result ?? []) as { index: number; samples: ArrayBuffer }[];
          resolve(
            rows.map((r) => ({
              index: r.index,
              samples: new Float32Array(r.samples),
            })),
          );
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function clearChunks(takeId: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, 'readwrite');
        const idx = tx.objectStore(CHUNKS).index('byTake');
        const req = idx.openCursor(IDBKeyRange.only(takeId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

/**
 * Pure assemble step for interrupted Session / FLIP capture recovery (A4).
 * Stitches draft chunks into a labelled incomplete take — no IndexedDB I/O.
 */
export function assembleRecoveredTake(
  draft: DraftState,
  chunks: PcmChunk[],
): { meta: TakeMeta; audio: StereoAudio } | null {
  if (!chunks.length) return null;
  try {
    const audio = stitchChunks(chunks, draft.meta.sampleRate);
    const meta: TakeMeta = {
      ...draft.meta,
      frameCount: audio.left.length,
      durationSec: audio.left.length / draft.meta.sampleRate,
      incomplete: true,
      name: draft.meta.name.includes('(recovered)')
        ? draft.meta.name
        : `${draft.meta.name} (recovered)`,
    };
    return { meta, audio };
  } catch {
    return null;
  }
}

/** Recover an interrupted take from draft + chunks. */
export async function recoverUnsavedTake(): Promise<{ meta: TakeMeta; audio: StereoAudio } | null> {
  const draft = await getDraft();
  if (!draft) return null;
  const chunks = await loadChunks(draft.takeId);
  if (!chunks.length) {
    await clearDraft();
    await clearChunks(draft.takeId);
    return null;
  }
  const assembled = assembleRecoveredTake(draft, chunks);
  if (!assembled) return null;
  const phase = await finalizeCompleteTake(assembled.meta, assembled.audio);
  if (phase !== 'saved_and_cleared') return null;
  return assembled;
}

export function makeTakeId(): string {
  return `take-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultTakeName(date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `jam ${h}${m}`;
}

export function buildTags(partial: Partial<TakeTags> & { inputDeviceName: string }): TakeTags {
  return {
    recordedAt: partial.recordedAt ?? new Date().toISOString(),
    tempoBpm: partial.tempoBpm ?? null,
    circuitProject: partial.circuitProject ?? null,
    studioScene: partial.studioScene ?? null,
    inputDeviceName: partial.inputDeviceName,
  };
}

export type { TakeMarker, TakeMeta, TakeTags };
