import type { MpcLibraryEntry, MpcLibraryListResponse } from './contract';

/**
 * Synthetic read-only fixtures for Phase C/D.
 * Invented names only — not copied from expansion-builder or unlicensed trees.
 */
export const FIXTURE_LIBRARY_ENTRIES: readonly MpcLibraryEntry[] = [
  {
    id: 'fx-projects',
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
    id: 'fx-night-bus',
    name: 'Night Bus.xpj',
    kind: 'project',
    relativePath: 'Projects/Night Bus.xpj',
  },
  {
    id: 'fx-audio',
    name: 'Audio',
    kind: 'folder',
    relativePath: 'Audio',
  },
  {
    id: 'fx-kick',
    name: 'kick_dry.wav',
    kind: 'sample',
    relativePath: 'Audio/kick_dry.wav',
  },
  {
    id: 'fx-hat',
    name: 'hat_open.wav',
    kind: 'sample',
    relativePath: 'Audio/hat_open.wav',
  },
  {
    id: 'fx-loop',
    name: 'loop_tape_12.wav',
    kind: 'sample',
    relativePath: 'Audio/loop_tape_12.wav',
  },
  {
    id: 'fx-expansions',
    name: 'Expansions',
    kind: 'folder',
    relativePath: 'Expansions',
  },
  {
    id: 'fx-exp-drums',
    name: 'Studio Drums Pack',
    kind: 'folder',
    relativePath: 'Expansions/Studio Drums Pack',
  },
  {
    id: 'fx-exp-keys',
    name: 'Keys Soft',
    kind: 'folder',
    relativePath: 'Expansions/Keys Soft',
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
