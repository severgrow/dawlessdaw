/**
 * Keeps the SP-404 Samples pads in this browser (IndexedDB) so they survive a
 * reload. Local to this Mac and this Chrome profile only — never sent anywhere,
 * never written to the SP. Every call fails quietly: the page still works
 * (just without saving) in a private window or with site data blocked.
 */
import type { PadAudio, PadEdit, SpBank } from './samplePrep';

export interface StoredPad {
  key: string;
  bank: SpBank;
  pad: number;
  sourceName: string;
  audio: PadAudio;
  edit: PadEdit;
}

const DB_NAME = 'dawlessdaw-sp404';
const STORE = 'pads';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function loadPads(): Promise<StoredPad[]> {
  try {
    return ((await withStore<StoredPad[]>('readonly', (s) => s.getAll())) ?? []).filter(
      (p) => p && typeof p.key === 'string' && Array.isArray(p.audio?.channels),
    );
  } catch {
    return [];
  }
}

export async function savePad(pad: StoredPad): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => {
      s.put(pad);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deletePad(key: string): Promise<void> {
  try {
    await withStore('readwrite', (s) => {
      s.delete(key);
    });
  } catch {
    // ignore
  }
}
