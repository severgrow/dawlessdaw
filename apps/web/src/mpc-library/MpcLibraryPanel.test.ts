import { describe, it, expect } from 'vitest';
import {
  FIXTURE_LIBRARY_ENTRIES,
  initialMpcLibrarySnapshot,
} from '@dawlessdaw/mpc-library';

describe('MpcLibraryPanel honesty contract', () => {
  it('initial snapshot is Offline with no invented health', () => {
    const snap = initialMpcLibrarySnapshot();
    expect(snap.status).toBe('offline');
    expect(snap.health).toBeNull();
    expect(snap.entries).toBeNull();
  });

  it('fixture preview data exists without implying Connected', () => {
    expect(FIXTURE_LIBRARY_ENTRIES.length).toBeGreaterThan(0);
    const snap = initialMpcLibrarySnapshot();
    expect(snap.status).not.toBe('connected');
  });
});
