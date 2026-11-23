import { describe, it, expect } from 'vitest';
import {
  MpcLibraryClient,
  entriesForProjectBackup,
  resolveBackupPath,
  verifyBackupCounts,
  FIXTURE_LIBRARY_ENTRIES,
} from './index';

describe('Phase F — library client failure paths', () => {
  it('never Connected when /health omits readOnly', async () => {
    const client = new MpcLibraryClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, mode: 'fixtures' }),
        text: async () => '',
      }),
    });
    const snap = await client.probe();
    expect(snap.status).toBe('error');
    expect(snap.health).toBeNull();
    expect(snap.status).not.toBe('connected');
  });

  it('HTTP 500 on /health stays offline/error — not Connected', async () => {
    const client = new MpcLibraryClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'boom',
      }),
    });
    const snap = await client.probe();
    expect(snap.status).not.toBe('connected');
    expect(snap.health).toBeNull();
  });

  it('Connected health with /library failure keeps entries null (soft)', async () => {
    const client = new MpcLibraryClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async (input) => {
        const path = String(input).replace(/^https?:\/\/[^/]+/, '');
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              version: '0.1.0-poc',
              mode: 'fixtures',
              readOnly: true,
              loopbackOnly: true,
              ssh: { available: false, optInRequired: true, reason: 'n/a' },
            }),
            text: async () => '',
          };
        }
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => 'list fail',
        };
      },
    });
    const snap = await client.probe();
    expect(snap.status).toBe('connected');
    expect(snap.health?.ok).toBe(true);
    expect(snap.entries).toBeNull();
  });
});

describe('Phase F — backup failure paths', () => {
  it('empty library plans nothing to back up', () => {
    expect(entriesForProjectBackup([], null)).toEqual([]);
  });

  it('fail policy stops on existing path (no silent overwrite)', () => {
    const existing = new Set(['Projects/Demo Beat.xpj']);
    const r = resolveBackupPath('Projects/Demo Beat.xpj', existing, 'fail');
    expect('conflict' in r).toBe(true);
  });

  it('verify fails when a written file is missing', () => {
    const v = verifyBackupCounts(['a.wav', 'b.xpj'], ['a.wav']);
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual(['b.xpj']);
  });

  it('fixture project backup still excludes expansions folders', () => {
    const demo = FIXTURE_LIBRARY_ENTRIES.find((e) => e.id === 'fx-demo-beat')!;
    const set = entriesForProjectBackup(FIXTURE_LIBRARY_ENTRIES, demo);
    expect(set.every((e) => !e.relativePath.startsWith('Expansions/'))).toBe(true);
  });
});
