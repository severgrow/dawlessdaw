import { describe, it, expect } from 'vitest';
import {
  backupRootLabel,
  entriesForProjectBackup,
  resolveBackupPath,
  verifyBackupCounts,
} from './backup';
import { FIXTURE_LIBRARY_ENTRIES } from './fixtures';
import { encodePcm16Wav, fixtureSamplePcm } from './fixture-content';

describe('backup path / verify', () => {
  it('never silently overwrites — renames instead', () => {
    const existing = new Set(['Projects/Demo Beat.xpj']);
    const r = resolveBackupPath('Projects/Demo Beat.xpj', existing, 'rename');
    expect('path' in r && r.path).toBe('Projects/Demo Beat (backup 2).xpj');
    expect('renamed' in r && r.renamed).toBe(true);
  });

  it('fail policy reports conflict', () => {
    const existing = new Set(['a.wav']);
    const r = resolveBackupPath('a.wav', existing, 'fail');
    expect('conflict' in r).toBe(true);
  });

  it('verifyBackupCounts catches missing files', () => {
    const v = verifyBackupCounts(['a', 'b', 'c'], ['a', 'c']);
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['b']);
    expect(v.planned).toBe(3);
    expect(v.written).toBe(2);
  });

  it('project backup includes selected project + audio fixtures', () => {
    const demo = FIXTURE_LIBRARY_ENTRIES.find((e) => e.id === 'fx-demo-beat')!;
    const set = entriesForProjectBackup(FIXTURE_LIBRARY_ENTRIES, demo);
    expect(set.some((e) => e.id === 'fx-demo-beat')).toBe(true);
    expect(set.some((e) => e.kind === 'sample')).toBe(true);
    expect(backupRootLabel(demo)).toBe('Demo Beat');
  });

  it('fixture WAV is stereo PCM without peak-normalizing to 1.0', () => {
    const pcm = fixtureSamplePcm({ id: 'fx-kick', name: 'kick_dry.wav' });
    let peak = 0;
    for (let i = 0; i < pcm.left.length; i++) {
      peak = Math.max(peak, Math.abs(pcm.left[i]!));
    }
    expect(peak).toBeLessThan(0.3);
    expect(peak).toBeGreaterThan(0.1);
    const wav = encodePcm16Wav(pcm);
    expect(wav.byteLength).toBeGreaterThan(44);
  });
});
