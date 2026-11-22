import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearCachedSpVolumeHandle,
  ensureImportDirectory,
  getCachedSpVolumeHandle,
  setCachedSpVolumeHandle,
  writeWavToImport,
  type FsDirectoryHandle,
} from './spVolumeHandle';

type MemFile = { data: Blob | null };
type MemDir = { name: string; dirs: Map<string, MemDir>; files: Map<string, MemFile> };

function memDir(name: string): MemDir {
  return { name, dirs: new Map(), files: new Map() };
}

function asHandle(dir: MemDir): FsDirectoryHandle {
  return {
    name: dir.name,
    kind: 'directory',
    async *entries() {
      for (const [n, d] of dir.dirs) {
        yield [n, asHandle(d)];
      }
      for (const [n] of dir.files) {
        yield [
          n,
          {
            name: n,
            kind: 'file',
            createWritable: async () => ({
              write: async () => undefined,
              close: async () => undefined,
            }),
          },
        ];
      }
    },
    getDirectoryHandle: async (name, opts) => {
      let child = dir.dirs.get(name);
      if (!child) {
        if (!opts?.create) throw new Error(`missing dir ${name}`);
        child = memDir(name);
        dir.dirs.set(name, child);
      }
      return asHandle(child);
    },
    getFileHandle: async (name, opts) => {
      let file = dir.files.get(name);
      if (!file) {
        if (!opts?.create) throw new Error(`missing file ${name}`);
        file = { data: null };
        dir.files.set(name, file);
      }
      const slot = file;
      return {
        name,
        kind: 'file',
        createWritable: async () => ({
          write: async (data) => {
            slot.data = data instanceof Blob ? data : new Blob([data]);
          },
          close: async () => undefined,
        }),
      };
    },
  };
}

describe('SP volume IMPORT write', () => {
  beforeEach(() => {
    clearCachedSpVolumeHandle();
  });

  it('caches the volume handle', () => {
    const root = asHandle(memDir('SP404SD'));
    expect(getCachedSpVolumeHandle()).toBeNull();
    setCachedSpVolumeHandle(root);
    expect(getCachedSpVolumeHandle()?.name).toBe('SP404SD');
    clearCachedSpVolumeHandle();
    expect(getCachedSpVolumeHandle()).toBeNull();
  });

  it('creates IMPORT/ when missing and writes A01-named WAV', async () => {
    const tree = memDir('SP404SD');
    const root = asHandle(tree);
    const importDir = await ensureImportDirectory(root);
    expect(importDir.name).toBe('IMPORT');
    expect(tree.dirs.has('IMPORT')).toBe(true);

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const result = await writeWavToImport(root, { bank: 'A', pad: 1 }, 'jam take', blob);
    expect(result.relativePath).toBe('IMPORT/A01 jam take.wav');
    expect(result.fileName).toBe('A01 jam take.wav');
    expect(tree.dirs.get('IMPORT')!.files.has('A01 jam take.wav')).toBe(true);
    expect(tree.dirs.get('IMPORT')!.files.get('A01 jam take.wav')!.data).toBeTruthy();
  });

  it('reuses an existing Import folder casing', async () => {
    const tree = memDir('CARD');
    tree.dirs.set('Import', memDir('Import'));
    const root = asHandle(tree);
    const importDir = await ensureImportDirectory(root);
    expect(importDir.name).toBe('Import');
    expect(tree.dirs.has('IMPORT')).toBe(false);
  });
});
