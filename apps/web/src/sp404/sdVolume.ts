/**
 * Chrome File System Access helpers for reading an SP-404MKII SD volume
 * (or a project folder copied from one). Read-only — never writes the card.
 */
import { padKey } from './samplePrep';
import {
  buildProjectScan,
  findProjectDirs,
  normalisePath,
  parseBankSmpFileName,
  parsePadconf,
  parseRfwvHeader,
  RFWV_HEADER_LEN,
  type ListedEntry,
  type RfwvInfo,
  type SdProjectScan,
} from './sdPadScan';

export type FsDirectoryHandle = {
  name: string;
  kind?: string;
  entries?: () => AsyncIterableIterator<[string, FsHandle]>;
  values?: () => AsyncIterableIterator<FsHandle>;
  getDirectoryHandle: (name: string) => Promise<FsDirectoryHandle>;
  getFileHandle: (name: string) => Promise<FsFileHandle>;
};

type FsFileHandle = {
  name: string;
  kind?: string;
  getFile: () => Promise<File>;
};

type FsHandle = FsDirectoryHandle | FsFileHandle;

export type SdScanProgress = (message: string) => void;

export interface SdVolumeScanResult {
  rootName: string;
  projects: SdProjectScan[];
  /** True when the root looks like a formatted SP card (IMPORT / EXPORT / BKUP). */
  looksLikeSpVolume: boolean;
  warnings: string[];
}

type SmplMeta = {
  fileName: string;
  fileBytes?: number | null;
  rfwv?: RfwvInfo | null;
};

async function* iterateChildren(dir: FsDirectoryHandle): AsyncGenerator<[string, FsHandle]> {
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

function isFileHandle(handle: FsHandle): handle is FsFileHandle {
  if (handle.kind === 'file') return true;
  if (handle.kind === 'directory') return false;
  return typeof (handle as FsFileHandle).getFile === 'function';
}

/** Walk a directory tree (depth-capped) into a flat listing. */
export async function listDirectoryTree(
  root: FsDirectoryHandle,
  opts: { maxDepth?: number; onProgress?: SdScanProgress } = {},
): Promise<ListedEntry[]> {
  const maxDepth = opts.maxDepth ?? 8;
  const out: ListedEntry[] = [];

  async function walk(dir: FsDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    opts.onProgress?.(prefix ? `Scanning ${prefix}…` : `Scanning “${dir.name}”…`);
    for await (const [name, handle] of iterateChildren(dir)) {
      if (name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${name}` : name;

      if (isFileHandle(handle)) {
        try {
          const file = await handle.getFile();
          out.push({ path, kind: 'file', size: file.size });
        } catch {
          out.push({ path, kind: 'file', size: null });
        }
        continue;
      }

      out.push({ path, kind: 'directory' });
      try {
        await walk(handle as FsDirectoryHandle, path, depth + 1);
      } catch {
        // Permission or I/O — skip this branch.
      }
    }
  }

  await walk(root, '', 0);
  return out;
}

async function readPadconfFromDir(dir: FsDirectoryHandle): Promise<ReturnType<typeof parsePadconf>> {
  for (const name of ['PADCONF.BIN', 'padconf.bin'] as const) {
    try {
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return parsePadconf(await file.arrayBuffer());
    } catch {
      // try next name
    }
  }
  return null;
}

async function readSmplMap(
  projectDir: FsDirectoryHandle,
  onProgress?: SdScanProgress,
): Promise<Partial<Record<string, SmplMeta>>> {
  let smpl: FsDirectoryHandle;
  try {
    smpl = await projectDir.getDirectoryHandle('SMPL');
  } catch {
    try {
      smpl = await projectDir.getDirectoryHandle('smpl');
    } catch {
      return {};
    }
  }

  const map: Partial<Record<string, SmplMeta>> = {};
  for await (const [name, handle] of iterateChildren(smpl)) {
    if (!isFileHandle(handle)) continue;
    const parsed = parseBankSmpFileName(name);
    if (!parsed) continue;
    onProgress?.(`Reading ${name}…`);
    const key = padKey(parsed.bank, parsed.pad);
    try {
      const file = await handle.getFile();
      const headerBuf = await file.slice(0, RFWV_HEADER_LEN).arrayBuffer();
      map[key] = {
        fileName: name,
        fileBytes: file.size,
        rfwv: parseRfwvHeader(headerBuf),
      };
    } catch {
      map[key] = { fileName: name, fileBytes: null, rfwv: null };
    }
  }
  return map;
}

async function resolveProjectDir(
  root: FsDirectoryHandle,
  relPath: string,
): Promise<FsDirectoryHandle | null> {
  const parts = normalisePath(relPath).split('/').filter(Boolean);
  let cur = root;
  for (const part of parts) {
    try {
      cur = await cur.getDirectoryHandle(part);
    } catch {
      return null;
    }
  }
  return cur;
}

/**
 * Scan a user-granted folder (SD volume root or a single PROJECT_* folder).
 * Read-only. Does not write, delete, or import.
 */
export async function scanSpVolume(
  root: FsDirectoryHandle,
  opts: { onProgress?: SdScanProgress } = {},
): Promise<SdVolumeScanResult> {
  const warnings: string[] = [];
  const listing = await listDirectoryTree(root, {
    maxDepth: 8,
    onProgress: opts.onProgress,
  });

  const top = new Set(
    listing.filter((e) => !e.path.includes('/')).map((e) => e.path.toUpperCase()),
  );
  const looksLikeSpVolume =
    top.has('IMPORT') ||
    top.has('EXPORT') ||
    top.has('BKUP') ||
    top.has('SMPL') ||
    top.has('PADCONF.BIN');

  if (
    top.has('BKUP') &&
    !top.has('EXPORT') &&
    !top.has('IMPORT') &&
    !listing.some((e) => /PADCONF\.BIN$/i.test(e.path))
  ) {
    warnings.push(
      'Found BKUP on this card. Full-system backups are not readable here — export the project on the SP (SHIFT + pad 14 → EXPORT → PROJECT) if you want a pad list.',
    );
  }

  let projectPaths = findProjectDirs(listing);

  // User may have granted the project folder itself.
  if (!projectPaths.length) {
    const hasPadconf = listing.some(
      (e) => e.kind === 'file' && /^PADCONF\.BIN$/i.test(e.path),
    );
    const hasSmpl = listing.some(
      (e) =>
        (e.kind === 'directory' && /^SMPL$/i.test(e.path)) ||
        (e.kind === 'file' && /^SMPL\//i.test(e.path)),
    );
    if (hasPadconf || hasSmpl) {
      projectPaths = [''];
    }
  }

  if (!projectPaths.length) {
    warnings.push(
      'No PROJECT folders with PADCONF.BIN or SMPL/ found. On the SP: SHIFT + pad 14 → EXPORT to SD-CARD → PROJECT, then put the card in a Mac reader and refresh.',
    );
  }

  const projects: SdProjectScan[] = [];
  for (const rel of projectPaths) {
    opts.onProgress?.(rel ? `Reading ${rel}…` : `Reading “${root.name}”…`);
    const dir = rel ? await resolveProjectDir(root, rel) : root;
    if (!dir) continue;
    const padconf = await readPadconfFromDir(dir);
    const smplFiles = await readSmplMap(dir, opts.onProgress);
    if (!padconf && !Object.keys(smplFiles).length) continue;
    projects.push(
      buildProjectScan({
        path: rel || root.name,
        padconf,
        smplFiles,
      }),
    );
  }

  projects.sort((a, b) => a.path.localeCompare(b.path));

  if (projects.length && !looksLikeSpVolume) {
    warnings.push(
      'This folder has project data, but it does not look like the SD card root (missing IMPORT / EXPORT / BKUP). That is fine if you opened a single PROJECT folder.',
    );
  }

  return {
    rootName: root.name,
    projects,
    looksLikeSpVolume,
    warnings,
  };
}

/** Prompt for a folder (Chrome / Edge). Returns null if cancelled or unsupported. */
export async function pickSpVolumeDirectory(): Promise<FsDirectoryHandle | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: {
      mode?: 'read' | 'readwrite';
      id?: string;
    }) => Promise<FsDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== 'function') return null;
  try {
    return await w.showDirectoryPicker({ mode: 'read', id: 'dawlessdaw-sp404-sd' });
  } catch {
    return null;
  }
}

export function fileSystemAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}
