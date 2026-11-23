import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWebIndex, resolveWebRoot } from './web-root.mjs';

describe('desktop web root', () => {
  it('loads packaged resources/web when the app is packaged', () => {
    const root = resolveWebRoot({
      isPackaged: true,
      desktopDir: '/repo/apps/desktop',
      resourcesPath: '/Applications/Splot MIDI Brain.app/Contents/Resources',
    });
    expect(root).toBe(
      path.join('/Applications/Splot MIDI Brain.app/Contents/Resources', 'web'),
    );
    expect(resolveWebIndex(root)).toBe(path.join(root, 'index.html'));
  });

  it('loads sibling apps/web/dist when unpackaged', () => {
    const root = resolveWebRoot({
      isPackaged: false,
      desktopDir: '/repo/apps/desktop',
      resourcesPath: '/unused',
    });
    expect(root).toBe(path.normalize('/repo/apps/web/dist'));
  });
});
