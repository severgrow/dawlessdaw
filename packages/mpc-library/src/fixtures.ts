import type { MpcLibraryEntry, MpcLibraryListResponse } from './contract';

/**
 * Synthetic read-only fixtures for Phase C.
 * Not copied from expansion-builder or any unlicensed tree — invented names only.
 */
export const FIXTURE_LIBRARY_ENTRIES: readonly MpcLibraryEntry[] = [
  {
    id: 'fix-projects',
    name: 'Projects',
    kind: 'folder',
    relativePath: 'Projects',
  },
  {
    id: 'fx-demo-beat',
    name: 'Demo Beat.xpj',
    kind: 'project',
    relativePath: 'Projects/Demo Beat.xpj',
  },
  {
    id: 'fx-sketch-a',
    name: 'Sketch A.xpj',
    kind: 'project',
    relativePath: 'Projects/Sketch A.xpj',
  },
  {
    id: 'fix-samples',
    name: 'Samples',
    kind: 'folder',
    relativePath: 'Samples',
  },
  {
    id: 'fx-kick',
    name: 'kick_dry.wav',
    kind: 'sample',
    relativePath: 'Samples/kick_dry.wav',
  },
  {
    id: 'fx-hat',
    name: 'hat_open.wav',
    kind: 'sample',
    relativePath: 'Samples/hat_open.wav',
  },
];

export function fixtureLibraryList(): MpcLibraryListResponse {
  return {
    rootLabel: 'fixtures (read-only PoC)',
    mode: 'fixtures',
    readOnly: true,
    entries: FIXTURE_LIBRARY_ENTRIES.map((e) => ({ ...e })),
  };
}
