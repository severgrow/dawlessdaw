import { describe, it, expect } from 'vitest';
import { FIXTURE_LIBRARY_ENTRIES } from '@dawlessdaw/mpc-library';
import { importLibraryEntryToFlip } from './importToFlip';
import { backupLibraryProject } from './backupProject';

describe('Phase F — import / backup failure paths (cheap)', () => {
  it('Import FLIP rejects non-sample (project) without inventing success', async () => {
    const project = FIXTURE_LIBRARY_ENTRIES.find((e) => e.kind === 'project')!;
    const r = await importLibraryEntryToFlip(project);
    expect(r.ok).toBe(false);
    expect(r.clip).toBeNull();
    expect(r.message).toMatch(/WAV|sample/i);
  });

  it('Import FLIP rejects folder entries', async () => {
    const folder = FIXTURE_LIBRARY_ENTRIES.find((e) => e.kind === 'folder')!;
    const r = await importLibraryEntryToFlip(folder);
    expect(r.ok).toBe(false);
    expect(r.clip).toBeNull();
  });

  it('backup with empty library aborts (no fake files)', async () => {
    const r = await backupLibraryProject({
      allEntries: [],
      selected: null,
    });
    expect(r.ok).toBe(false);
    expect(r.written).toBe(0);
    expect(r.mode).toBe('aborted');
    expect(r.message).toMatch(/nothing/i);
  });
});
