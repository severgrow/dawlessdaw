import { describe, it, expect } from 'vitest';
import {
  FIXTURE_LIBRARY_ENTRIES,
  entriesForSection,
  initialMpcLibrarySnapshot,
} from '@dawlessdaw/mpc-library';

describe('MpcLibraryBrowser honesty + sections', () => {
  it('starts Offline — never invents Connected', () => {
    const snap = initialMpcLibrarySnapshot();
    expect(snap.status).toBe('offline');
    expect(snap.health).toBeNull();
  });

  it('fixtures cover Projects, Audio, Expansions', () => {
    expect(entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'projects').length).toBeGreaterThan(0);
    expect(entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'audio').length).toBeGreaterThan(0);
    expect(entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'expansions').length).toBeGreaterThan(0);
  });
});
