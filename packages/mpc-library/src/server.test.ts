import { describe, it, expect, afterEach } from 'vitest';
import { startCompanionServer, type StartedCompanionServer } from './server';
import { resolveSshLibraryStatus } from './ssh-stub';
import { fixtureLibraryList } from './fixtures';

describe('Library companion server', () => {
  let server: StartedCompanionServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('serves /health and /library on loopback with CORS for localhost origin', async () => {
    server = await startCompanionServer({ port: 0, allowMissingOrigin: true });
    const origin = 'http://localhost:5173';
    const healthRes = await fetch(`${server.baseUrl}/health`, {
      headers: { Origin: origin },
    });
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('access-control-allow-origin')).toBe(origin);
    const health = (await healthRes.json()) as {
      ok: boolean;
      readOnly: boolean;
      mode: string;
      ssh: { available: boolean };
    };
    expect(health.ok).toBe(true);
    expect(health.readOnly).toBe(true);
    expect(health.mode).toBe('fixtures');
    expect(health.ssh.available).toBe(false);

    const libRes = await fetch(`${server.baseUrl}/library`, {
      headers: { Origin: origin },
    });
    expect(libRes.status).toBe(200);
    const lib = (await libRes.json()) as { entries: unknown[]; readOnly: boolean };
    expect(lib.readOnly).toBe(true);
    expect(lib.entries.length).toBe(fixtureLibraryList().entries.length);
  });

  it('rejects disallowed Origin', async () => {
    server = await startCompanionServer({ port: 0, allowMissingOrigin: false });
    const res = await fetch(`${server.baseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-GET (no shell / no write)', async () => {
    server = await startCompanionServer({ port: 0, allowMissingOrigin: true });
    const res = await fetch(`${server.baseUrl}/health`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('refuses non-loopback bind', async () => {
    await expect(startCompanionServer({ host: '0.0.0.0', port: 0 })).rejects.toThrow(
      /loopback/i,
    );
  });
});

describe('SSH stub', () => {
  it('never reports available — even with opt-in', () => {
    expect(resolveSshLibraryStatus().available).toBe(false);
    expect(resolveSshLibraryStatus({ optIn: true }).available).toBe(false);
    expect(resolveSshLibraryStatus({ optIn: true }).optInRequired).toBe(true);
  });
});
