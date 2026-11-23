import type { MpcLibraryEntry } from './contract';

/** Top-level browse buckets for Phase D (read-only). */
export type MpcLibrarySectionId = 'projects' | 'audio' | 'expansions';

export const MPC_LIBRARY_SECTIONS: readonly {
  id: MpcLibrarySectionId;
  label: string;
  folderName: string;
}[] = [
  { id: 'projects', label: 'Projects', folderName: 'Projects' },
  { id: 'audio', label: 'Audio', folderName: 'Audio' },
  { id: 'expansions', label: 'Expansions', folderName: 'Expansions' },
] as const;

/** Map an entry to a browse section from its relative path (fixtures / companion). */
export function sectionForEntry(entry: Pick<MpcLibraryEntry, 'relativePath'>): MpcLibrarySectionId | null {
  const top = entry.relativePath.split(/[/\\]/)[0]?.toLowerCase() ?? '';
  if (top === 'projects') return 'projects';
  if (top === 'audio' || top === 'samples') return 'audio';
  if (top === 'expansions') return 'expansions';
  return null;
}

export function entriesForSection(
  entries: readonly MpcLibraryEntry[],
  section: MpcLibrarySectionId,
): MpcLibraryEntry[] {
  return entries.filter((e) => {
    const s = sectionForEntry(e);
    if (s !== section) return false;
    // Skip the root folder row itself — section tab already names it.
    const parts = e.relativePath.split(/[/\\]/);
    return parts.length > 1 || e.kind !== 'folder';
  });
}
