import { describe, it, expect } from 'vitest';
import { FIXTURE_LIBRARY_ENTRIES, fixtureSamplePcm } from '@dawlessdaw/mpc-library';

describe('Import to FLIP helpers', () => {
  it('fixture samples stay below unity (no auto-norm)', () => {
    const kick = FIXTURE_LIBRARY_ENTRIES.find((e) => e.id === 'fx-kick')!;
    const pcm = fixtureSamplePcm(kick);
    let peak = 0;
    for (const s of pcm.left) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeLessThan(0.99);
    expect(peak).toBeGreaterThan(0);
  });

  it('only sample entries are FLIP-import candidates', () => {
    const samples = FIXTURE_LIBRARY_ENTRIES.filter((e) => e.kind === 'sample');
    const projects = FIXTURE_LIBRARY_ENTRIES.filter((e) => e.kind === 'project');
    expect(samples.length).toBeGreaterThan(0);
    expect(projects.every((e) => e.kind !== 'sample')).toBe(true);
  });
});
