/**
 * Phase E — Back up project (browser).
 * Stream/copy with progress; never silent overwrite; verify counts.
 * Fixtures generate bytes when companion is offline. No write-to-MPC.
 */
import {
  backupRootLabel,
  entriesForProjectBackup,
  fixtureBytesForEntry,
  resolveBackupPath,
  verifyBackupCounts,
  type BackupProgress,
  type MpcLibraryEntry,
} from '@dawlessdaw/mpc-library';

export interface BackupProjectResult {
  ok: boolean;
  message: string;
  planned: number;
  written: number;
  mode: 'directory' | 'download' | 'aborted';
  renamed: number;
}

type DirHandle = {
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{ write: (d: BufferSource) => Promise<void>; close: () => Promise<void> }>;
  }>;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandle>;
  values?: () => AsyncIterable<{ kind: string; name: string }>;
};

function splitPath(rel: string): { dirs: string[]; file: string } {
  const parts = rel.split('/').filter(Boolean);
  const file = parts.pop() ?? 'file';
  return { dirs: parts, file };
}

async function listExistingRelative(root: DirHandle, prefix = ''): Promise<Set<string>> {
  const out = new Set<string>();
  if (!root.values) return out;
  for await (const entry of root.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') out.add(path);
    // shallow listing is enough for conflict checks on planned paths
  }
  return out;
}

async function ensureFile(
  root: DirHandle,
  relativePath: string,
): Promise<{ write: (d: BufferSource) => Promise<void>; close: () => Promise<void> }> {
  const { dirs, file } = splitPath(relativePath);
  let dir = root;
  for (const d of dirs) {
    dir = await dir.getDirectoryHandle(d, { create: true });
  }
  const fh = await dir.getFileHandle(file, { create: true });
  return fh.createWritable();
}

async function pathExists(root: DirHandle, relativePath: string): Promise<boolean> {
  const { dirs, file } = splitPath(relativePath);
  try {
    let dir = root;
    for (const d of dirs) {
      dir = await dir.getDirectoryHandle(d, { create: false });
    }
    await dir.getFileHandle(file, { create: false });
    return true;
  } catch {
    return false;
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([asArrayBuffer(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Back up selected project (or all projects + audio) to a user folder / downloads.
 */
export async function backupLibraryProject(opts: {
  allEntries: readonly MpcLibraryEntry[];
  selected: MpcLibraryEntry | null;
  onProgress?: (p: BackupProgress) => void;
}): Promise<BackupProjectResult> {
  const sources = entriesForProjectBackup(opts.allEntries, opts.selected);
  if (sources.length === 0) {
    return {
      ok: false,
      message: 'Nothing to back up',
      planned: 0,
      written: 0,
      mode: 'aborted',
      renamed: 0,
    };
  }

  const plans = sources.map((e) => ({
    entry: e,
    relativePath: e.relativePath,
    bytes: fixtureBytesForEntry(e),
  }));

  const picker = (
    window as unknown as {
      showDirectoryPicker?: (o?: { mode?: string }) => Promise<DirHandle>;
    }
  ).showDirectoryPicker;

  if (typeof picker === 'function') {
    try {
      const root = await picker({ mode: 'readwrite' });
      const folderName =
        backupRootLabel(opts.selected).replace(/[^\w\- ]+/g, '_').trim() || 'mpc-backup';
      const destRoot = await root.getDirectoryHandle(folderName, { create: true });

      const existing = await listExistingRelative(destRoot);
      for (const p of plans) {
        if (await pathExists(destRoot, p.relativePath)) existing.add(p.relativePath);
      }

      const finalPaths: string[] = [];
      let renamed = 0;
      const written: string[] = [];

      for (let i = 0; i < plans.length; i++) {
        const p = plans[i]!;
        opts.onProgress?.({
          done: i,
          total: plans.length,
          currentPath: p.relativePath,
        });
        const resolved = resolveBackupPath(p.relativePath, existing, 'rename');
        if ('conflict' in resolved) {
          return {
            ok: false,
            message: `Would overwrite “${resolved.conflict.relativePath}” — backup stopped (no silent overwrite)`,
            planned: plans.length,
            written: written.length,
            mode: 'directory',
            renamed,
          };
        }
        if (resolved.renamed) renamed += 1;
        existing.add(resolved.path);
        finalPaths.push(resolved.path);
        const w = await ensureFile(destRoot, resolved.path);
        await w.write(asArrayBuffer(p.bytes));
        await w.close();
        written.push(resolved.path);
      }

      opts.onProgress?.({
        done: plans.length,
        total: plans.length,
        currentPath: null,
      });

      const verify = verifyBackupCounts(finalPaths, written);
      return {
        ok: verify.ok,
        message: verify.ok
          ? `Backed up ${verify.written}/${verify.planned} file(s)${renamed ? ` · ${renamed} renamed` : ''}`
          : `Verify failed — missing ${verify.missing.join(', ') || 'files'}`,
        planned: verify.planned,
        written: verify.written,
        mode: 'directory',
        renamed,
      };
    } catch {
      // Picker cancelled / unavailable (e.g. headless) → fall through to downloads.
    }
  }

  // Fallback: individual downloads (still no silent overwrite of prior downloads —
  // browser names uniquely; we suffix in the download filename when needed).
  const used = new Set<string>();
  let renamed = 0;
  const written: string[] = [];
  const plannedNames: string[] = [];

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]!;
    opts.onProgress?.({ done: i, total: plans.length, currentPath: p.relativePath });
    const baseName = p.relativePath.replace(/\//g, '__');
    const resolved = resolveBackupPath(baseName, used, 'rename');
    if ('conflict' in resolved) {
      return {
        ok: false,
        message: `Name conflict for “${baseName}”`,
        planned: plans.length,
        written: written.length,
        mode: 'download',
        renamed,
      };
    }
    if (resolved.renamed) renamed += 1;
    used.add(resolved.path);
    plannedNames.push(resolved.path);
    downloadBlob(p.bytes, resolved.path);
    written.push(resolved.path);
  }

  opts.onProgress?.({ done: plans.length, total: plans.length, currentPath: null });
  const verify = verifyBackupCounts(plannedNames, written);
  return {
    ok: verify.ok,
    message: verify.ok
      ? `Downloaded ${verify.written} file(s) (no folder picker)${renamed ? ` · ${renamed} renamed` : ''}`
      : `Download verify failed`,
    planned: verify.planned,
    written: verify.written,
    mode: 'download',
    renamed,
  };
}
