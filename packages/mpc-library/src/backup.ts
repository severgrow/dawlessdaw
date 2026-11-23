import type { MpcLibraryEntry } from './contract';
import { entriesForSection, sectionForEntry } from './sections';

export interface BackupFilePlan {
  /** Relative path under the backup destination folder. */
  relativePath: string;
  /** Source library entry id (or synthetic). */
  entryId: string;
  /** Bytes to write (fixtures / companion payload). */
  bytes: Uint8Array;
}

export interface BackupConflict {
  relativePath: string;
  reason: 'exists';
}

export type BackupOverwritePolicy = 'fail' | 'rename';

/**
 * Never silent overwrite: if a dest name exists, either fail or rename with a suffix.
 */
export function resolveBackupPath(
  relativePath: string,
  existingPaths: ReadonlySet<string>,
  policy: BackupOverwritePolicy = 'rename',
): { path: string; renamed: boolean } | { conflict: BackupConflict } {
  if (!existingPaths.has(relativePath)) {
    return { path: relativePath, renamed: false };
  }
  if (policy === 'fail') {
    return { conflict: { relativePath, reason: 'exists' } };
  }
  const dot = relativePath.lastIndexOf('.');
  const hasExt = dot > relativePath.lastIndexOf('/') && dot > 0;
  const stem = hasExt ? relativePath.slice(0, dot) : relativePath;
  const ext = hasExt ? relativePath.slice(dot) : '';
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (backup ${n})${ext}`;
    if (!existingPaths.has(candidate)) {
      return { path: candidate, renamed: true };
    }
  }
  return { conflict: { relativePath, reason: 'exists' } };
}

export interface BackupProgress {
  done: number;
  total: number;
  currentPath: string | null;
}

export interface BackupVerifyResult {
  ok: boolean;
  planned: number;
  written: number;
  missing: string[];
}

export function verifyBackupCounts(
  plannedPaths: readonly string[],
  writtenPaths: readonly string[],
): BackupVerifyResult {
  const written = new Set(writtenPaths);
  const missing = plannedPaths.filter((p) => !written.has(p));
  return {
    ok: missing.length === 0 && plannedPaths.length === writtenPaths.length,
    planned: plannedPaths.length,
    written: writtenPaths.length,
    missing,
  };
}

/** Entries included when backing up a project selection (project file + Audio samples). */
export function entriesForProjectBackup(
  all: readonly MpcLibraryEntry[],
  selected: MpcLibraryEntry | null,
): MpcLibraryEntry[] {
  const projects = entriesForSection(all, 'projects').filter((e) => e.kind === 'project');
  const audio = entriesForSection(all, 'audio');
  if (selected && sectionForEntry(selected) === 'projects' && selected.kind === 'project') {
    return [selected, ...audio];
  }
  if (selected && sectionForEntry(selected) === 'audio') {
    return [selected];
  }
  // Default: all projects + audio (fixture-safe)
  return [...projects, ...audio];
}

export function backupRootLabel(selected: MpcLibraryEntry | null): string {
  if (selected?.kind === 'project') {
    return selected.name.replace(/\.[^.]+$/, '') || 'mpc-backup';
  }
  return 'mpc-library-backup';
}
