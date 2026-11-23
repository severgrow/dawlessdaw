import { describe, it, expect } from 'vitest';
import {
  MpcLibraryClient,
  initialMpcLibrarySnapshot,
} from './client';
import { fixtureLibraryList } from './fixtures';
import { MPC_LIBRARY_COMPANION_VERSION } from './contract';

describe('MpcLibraryClient', () => {
  it('starts Offline and never invents Connected', () => {
    const snap = initialMpcLibrarySnapshot();
    expect(snap.status).toBe('offline');
    expect(snap.health).toBeNull();
    expect(snap.entries).toBeNull();
  });

  it('rejects non-loopback base URLs', () => {
    expect(() => new MpcLibraryClient({ baseUrl: 'http://example.com:8787' })).toThrow(
      /loopback/i,
    );
  });

  it('Connected only after /health ok', async () => {
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
              version: MPC_LIBRARY_COMPANION_VERSION,
              mode: 'fixtures',
              readOnly: true,
              loopbackOnly: true,
              ssh: { available: false, optInRequired: true, reason: 'fixtures only' },
            }),
            text: async () => '',
          };
        }
        if (path === '/library') {
          return {
            ok: true,
            status: 200,
            json: async () => fixtureLibraryList(),
            text: async () => '',
          };
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => 'no' };
      },
    });
    const snap = await client.probe();
    expect(snap.status).toBe('connected');
    expect(snap.health?.ok).toBe(true);
    expect(snap.entries?.length).toBeGreaterThan(0);
  });

  it('stays offline when companion is unreachable', async () => {
    const client = new MpcLibraryClient({
      baseUrl: 'http://127.0.0.1:8787',
      timeoutMs: 50,
      fetchImpl: async () => {
        throw new Error('Failed to fetch');
      },
    });
    const snap = await client.probe();
    expect(snap.status).toBe('offline');
    expect(snap.health).toBeNull();
  });
});
