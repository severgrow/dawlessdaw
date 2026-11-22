import { describe, it, expect } from 'vitest';
import { renderFilename, DEFAULT_FILENAME_PATTERN } from './filename';

describe('filename pattern', () => {
  it('renders date name bpm like the spec example', () => {
    const name = renderFilename(DEFAULT_FILENAME_PATTERN, {
      date: new Date('2026-11-22T12:00:00'),
      name: 'Ploe jam',
      bpm: 128,
      ext: 'wav',
    });
    expect(name).toBe('2026-11-22 Ploe jam 128bpm.wav');
  });
});
