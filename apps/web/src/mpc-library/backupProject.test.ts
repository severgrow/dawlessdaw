import { describe, it, expect } from 'vitest';
import {
  FIXTURE_LIBRARY_ENTRIES,
  entriesForProjectBackup,
  resolveBackupPath,
  verifyBackupCounts,
} from '@dawlessdaw/mpc-library';

describe('backupProject contract', () => {
  it('plans project + audio and verifies equal counts', () => {
    const demo = FIXTURE_LIBRARY_ENTRIES.find((e) => e.id === 'fx-demo-beat')!;
    const planned = entriesForProjectBackup(FIXTURE_LIBRARY_ENTRIES, demo).map(
      (e) => e.relativePath,
    );
    const existing = new Set<string>();
    const written: string[] = [];
    for (const p of planned) {
      const r = resolveBackupPath(p, existing, 'rename');
      expect('path' in r).toBe(true);
      if ('path' in r) {
        existing.add(r.path);
        written.push(r.path);
      }
    }
    expect(verifyBackupCounts(written, written).ok).toBe(true);
  });
});
