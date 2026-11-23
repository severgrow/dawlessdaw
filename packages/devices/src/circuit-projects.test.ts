import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_PROJECT_SLOT_COUNT,
  defaultProjectSlot,
  emptyProjectGrid,
  normalizeProjectGrid,
} from './circuit-projects';

describe('circuit-projects', () => {
  it('builds 64 default slots', () => {
    const g = emptyProjectGrid();
    expect(g).toHaveLength(CIRCUIT_PROJECT_SLOT_COUNT);
    expect(g[0]).toEqual(defaultProjectSlot(1));
    expect(g[63]!.index).toBe(64);
  });

  it('normalizes partial user edits', () => {
    const g = normalizeProjectGrid([
      { index: 1, name: ' Intro ', colour: '#112233' },
      { index: 99, name: 'bad' },
      { index: 3, name: '' },
    ]);
    expect(g[0]!.name).toBe('Intro');
    expect(g[0]!.colour).toBe('#112233');
    expect(g[2]!.name).toBe('Project 3');
  });
});
