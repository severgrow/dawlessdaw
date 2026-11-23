import http from 'node:http';
import type { MpcLibraryHealth, MpcLibraryListResponse } from './contract';
import { MPC_LIBRARY_COMPANION_VERSION, MPC_LIBRARY_DEFAULT_PORT } from './contract';
import { fixtureLibraryList } from './fixtures';
import {
  assertLoopbackBindHost,
  hostnameFromHostHeader,
  isAllowedCompanionOrigin,
  isLoopbackHost,
} from './origin';
import { resolveSshLibraryStatus } from './ssh-stub';

export interface CompanionServerOptions {
  host?: string;
  port?: number;
  /** Explicit SSH opt-in flag — still unavailable in Phase C. */
  sshOptIn?: boolean;
  /** Allow CLI health checks with no Origin (still loopback Host only). */
  allowMissingOrigin?: boolean;
}

function healthPayload(sshOptIn: boolean): MpcLibraryHealth {
  return {
    ok: true,
    version: MPC_LIBRARY_COMPANION_VERSION,
    mode: 'fixtures',
    readOnly: true,
    loopbackOnly: true,
    ssh: resolveSshLibraryStatus({ optIn: sshOptIn }),
  };
}

function json(res: http.ServerResponse, status: number, body: unknown, origin: string | null): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (origin && isAllowedCompanionOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.end(payload);
}

function reject(res: http.ServerResponse, status: number, message: string, origin: string | null): void {
  json(res, status, { ok: false, error: message }, origin);
}

/**
 * Request handler for the Library companion (fixtures mode).
 * No shell, no FS write, no SSH sockets — read-only JSON only.
 */
export function createCompanionRequestListener(opts: CompanionServerOptions = {}) {
  const sshOptIn = opts.sshOptIn === true;
  const allowMissingOrigin = opts.allowMissingOrigin !== false;

  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const hostName = hostnameFromHostHeader(
      typeof req.headers.host === 'string' ? req.headers.host : null,
    );

    // Refuse if Host claims a non-loopback name (defense in depth; we bind loopback too).
    if (hostName && !isLoopbackHost(hostName)) {
      reject(res, 403, 'Host must be loopback', origin);
      return;
    }

    if (req.method === 'OPTIONS') {
      if (origin && isAllowedCompanionOrigin(origin)) {
        res.statusCode = 204;
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
        res.setHeader('Vary', 'Origin');
        res.end();
        return;
      }
      reject(res, 403, 'Origin not allowed', origin);
      return;
    }

    if (req.method !== 'GET') {
      reject(res, 405, 'Read-only companion — GET only', origin);
      return;
    }

    const originOk =
      (origin && isAllowedCompanionOrigin(origin)) ||
      (!origin && allowMissingOrigin);

    if (!originOk) {
      reject(res, 403, 'Origin not allowed (loopback web origins only)', origin);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/health') {
      json(res, 200, healthPayload(sshOptIn), origin);
      return;
    }
    if (url.pathname === '/library') {
      const list: MpcLibraryListResponse = fixtureLibraryList();
      json(res, 200, list, origin);
      return;
    }
    reject(res, 404, `Unknown path ${url.pathname}`, origin);
  };
}

export interface StartedCompanionServer {
  host: string;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

/** Start the companion on 127.0.0.1 only. */
export async function startCompanionServer(
  opts: CompanionServerOptions = {},
): Promise<StartedCompanionServer> {
  const host = opts.host ?? '127.0.0.1';
  assertLoopbackBindHost(host);
  const port = opts.port ?? MPC_LIBRARY_DEFAULT_PORT;
  const server = http.createServer(createCompanionRequestListener(opts));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : port;

  return {
    host,
    port: boundPort,
    baseUrl: `http://${host === 'localhost' ? '127.0.0.1' : host}:${boundPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
