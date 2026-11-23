import { describe, it, expect } from 'vitest';
import { FIXTURE_LIBRARY_ENTRIES } from './fixtures';
import { entriesForSection, sectionForEntry } from './sections';

describe('MPC library sections', () => {
  it('maps Projects / Audio / Expansions paths', () => {
    expect(sectionForEntry({ relativePath: 'Projects/Demo Beat.xpj' })).toBe('projects');
    expect(sectionForEntry({ relativePath: 'Audio/kick_dry.wav' })).toBe('audio');
    expect(sectionForEntry({ relativePath: 'Samples/kick_dry.wav' })).toBe('audio');
    expect(sectionForEntry({ relativePath: 'Expansions/Keys Soft' })).toBe('expansions');
    expect(sectionForEntry({ relativePath: 'Other/x' })).toBeNull();
  });

  it('lists fixture items per section without root folders', () => {
    const projects = entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'projects');
    expect(projects.every((e) => e.relativePath.startsWith('Projects/'))).toBe(true);
    expect(projects.some((e) => e.kind === 'project')).toBe(true);

    const audio = entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'audio');
    expect(audio.every((e) => e.kind === 'sample')).toBe(true);

    const expansions = entriesForSection(FIXTURE_LIBRARY_ENTRIES, 'expansions');
    expect(expansions.length).toBeGreaterThan(0);
    expect(expansions.every((e) => e.relativePath.startsWith('Expansions/'))).toBe(true);
  });
});
