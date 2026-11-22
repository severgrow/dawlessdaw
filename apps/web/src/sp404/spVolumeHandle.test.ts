import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EXPORT_SAMPLE_RATE, encodeWav16 } from './samplePrep';
import {
  classifyVolumeGrant,
  clearCachedSpVolumeHandle,
  ensureImportDirectory,
  formatSpWriteError,
  getCachedSpVolumeHandle,
  readWavFormat,
  setCachedSpVolumeHandle,
  SpVolumeError,
  writeWavToImport,
  type FsDirectoryHandle,
} from './spVolumeHandle';

type MemFile = { data: Uint8Array | null };
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
            if (data instanceof ArrayBuffer) {
              slot.data = new Uint8Array(data.slice(0));
            } else if (ArrayBuffer.isView(data)) {
              const view = data as ArrayBufferView;
              slot.data = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
            } else if (data instanceof Blob) {
              slot.data = new Uint8Array(await data.arrayBuffer());
            } else {
              slot.data = new TextEncoder().encode(String(data));
            }
          },
          close: async () => undefined,
        }),
        getFile: async () => ({
          name,
          size: slot.data?.byteLength ?? 0,
        }),
      };
    },
  };
}

describe('SP volume IMPORT write', () => {
  beforeEach(() => {
    clearCachedSpVolumeHandle();
    vi.stubGlobal('indexedDB', undefined);
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

    const pcm = encodeWav16({
      sampleRate: EXPORT_SAMPLE_RATE,
      channels: [new Float32Array(8), new Float32Array(8)],
    });
    const result = await writeWavToImport(root, { bank: 'A', pad: 1 }, 'jam take', pcm);
    expect(result.relativePath).toBe('IMPORT/A01 jam take.wav');
    expect(result.fileName).toBe('A01 jam take.wav');
    expect(result.bytesWritten).toBe(pcm.byteLength);
    // Creating IMPORT/ makes the volume look like an SP root.
    expect(result.grantKind).toBe('sp-root');
    const written = tree.dirs.get('IMPORT')!.files.get('A01 jam take.wav')!.data!;
    expect(written.byteLength).toBe(pcm.byteLength);
    const wavBuf = written.buffer.slice(
      written.byteOffset,
      written.byteOffset + written.byteLength,
    ) as ArrayBuffer;
    expect(readWavFormat(wavBuf)).toEqual({
      sampleRate: 48000,
      bitsPerSample: 16,
      channels: 2,
    });
  });

  it('reuses an existing Import folder casing', async () => {
    const tree = memDir('CARD');
    tree.dirs.set('Import', memDir('Import'));
    const root = asHandle(tree);
    const importDir = await ensureImportDirectory(root);
    expect(importDir.name).toBe('Import');
    expect(tree.dirs.has('IMPORT')).toBe(false);
  });

  it('writes into the granted IMPORT folder without nesting IMPORT/IMPORT', async () => {
    const tree = memDir('IMPORT');
    const root = asHandle(tree);
    const importDir = await ensureImportDirectory(root);
    expect(importDir.name).toBe('IMPORT');
    expect(tree.dirs.has('IMPORT')).toBe(false);

    const pcm = encodeWav16({
      sampleRate: EXPORT_SAMPLE_RATE,
      channels: [new Float32Array(4), new Float32Array(4)],
    });
    const result = await writeWavToImport(root, { bank: 'D', pad: 4 }, 'loop', pcm);
    expect(result.relativePath).toBe('IMPORT/D04 loop.wav');
    expect(result.grantKind).toBe('import-folder');
    expect(tree.files.has('D04 loop.wav')).toBe(true);
    expect(tree.dirs.size).toBe(0);
  });

  it('classifies SP card roots vs unknown folders', () => {
    expect(classifyVolumeGrant('NO NAME', ['IMPORT', 'EXPORT', 'BKUP']).kind).toBe('sp-root');
    expect(classifyVolumeGrant('IMPORT', ['A01 kick.wav']).kind).toBe('import-folder');
    expect(classifyVolumeGrant('Desktop', ['Photos']).kind).toBe('unknown');
    expect(classifyVolumeGrant('Desktop', ['Photos']).warning).toMatch(/SD card root/i);
  });

  it('rejects tiny buffers and reports verify mismatch', async () => {
    const tree = memDir('IMPORT');
    const root = asHandle(tree);
    await expect(
      writeWavToImport(root, { bank: 'A', pad: 1 }, 'x', new Uint8Array([1, 2, 3])),
    ).rejects.toBeInstanceOf(SpVolumeError);

    // Grant IMPORT itself so getFileHandle is on this handle (not a child).
    const realGet = root.getFileHandle.bind(root);
    root.getFileHandle = async (name, opts) => {
      const fh = await realGet(name, opts);
      return {
        name: fh.name,
        kind: 'file',
        createWritable: fh.createWritable,
        getFile: async () => ({ name, size: 1 }),
      };
    };
    const pcm = encodeWav16({
      sampleRate: EXPORT_SAMPLE_RATE,
      channels: [new Float32Array(2), new Float32Array(2)],
    });
    await expect(
      writeWavToImport(root, { bank: 'A', pad: 1 }, 'x', pcm),
    ).rejects.toMatchObject({ code: 'verify' });
  });

  it('formats permission errors clearly', () => {
    expect(formatSpWriteError(new SpVolumeError('permission', 'nope'))).toBe('nope');
    const denied = new DOMException('denied', 'NotAllowedError');
    expect(formatSpWriteError(denied)).toMatch(/Write permission denied/i);
  });
});
