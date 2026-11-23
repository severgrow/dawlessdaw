import {
  MPC_LIBRARY_DEFAULT_BASE_URL,
  type MpcLibraryClientSnapshot,
  type MpcLibraryHealth,
  type MpcLibraryListResponse,
} from './contract';
import { assertLoopbackBaseUrl } from './origin';

export type MpcLibraryFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface MpcLibraryClientOptions {
  baseUrl?: string;
  /** Inject for tests; defaults to global fetch. */
  fetchImpl?: MpcLibraryFetch;
  /** Abort / timeout ms for probes (default 1500). */
  timeoutMs?: number;
}

function offlineSnapshot(
  baseUrl: string,
  patch: Partial<MpcLibraryClientSnapshot> = {},
): MpcLibraryClientSnapshot {
  return {
    status: 'offline',
    health: null,
    entries: null,
    error: null,
    baseUrl,
    ...patch,
  };
}

/**
 * Browser / Node client for the loopback Library companion.
 * Never claims Connected without a successful /health response.
 */
export class MpcLibraryClient {
  readonly baseUrl: string;
  private readonly fetchImpl: MpcLibraryFetch;
  private readonly timeoutMs: number;

  constructor(opts: MpcLibraryClientOptions = {}) {
    const base = opts.baseUrl ?? MPC_LIBRARY_DEFAULT_BASE_URL;
    assertLoopbackBaseUrl(base);
    this.baseUrl = base.replace(/\/$/, '');
    this.fetchImpl =
      opts.fetchImpl ??
      ((input, init) => fetch(input, init) as ReturnType<MpcLibraryFetch>);
    this.timeoutMs = opts.timeoutMs ?? 1500;
  }

  async probe(): Promise<MpcLibraryClientSnapshot> {
    const probing = offlineSnapshot(this.baseUrl, { status: 'probing' });
    void probing;
    try {
      const health = await this.getHealth();
      let entries: MpcLibraryListResponse['entries'] | null = null;
      try {
        const list = await this.listLibrary();
        entries = list.entries;
      } catch {
        // Health alone is enough for Connected; list failure is a soft error.
        entries = null;
      }
      return {
        status: 'connected',
        health,
        entries,
        error: null,
        baseUrl: this.baseUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return offlineSnapshot(this.baseUrl, {
        status: message.includes('fetch') || message.includes('Failed') ? 'offline' : 'error',
        error: message,
      });
    }
  }

  async getHealth(): Promise<MpcLibraryHealth> {
    const data = await this.getJson('/health');
    if (
      !data ||
      typeof data !== 'object' ||
      (data as { ok?: unknown }).ok !== true ||
      (data as { readOnly?: unknown }).readOnly !== true
    ) {
      throw new Error('Companion /health did not return a read-only ok payload');
    }
    return data as MpcLibraryHealth;
  }

  async listLibrary(): Promise<MpcLibraryListResponse> {
    const data = await this.getJson('/library');
    if (
      !data ||
      typeof data !== 'object' ||
      (data as { readOnly?: unknown }).readOnly !== true ||
      !Array.isArray((data as { entries?: unknown }).entries)
    ) {
      throw new Error('Companion /library did not return a read-only list');
    }
    return data as MpcLibraryListResponse;
  }

  private async getJson(path: string): Promise<unknown> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer =
      ctrl && this.timeoutMs > 0
        ? setTimeout(() => ctrl.abort(), this.timeoutMs)
        : null;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctrl?.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Companion ${path} → HTTP ${res.status}${body ? `: ${body}` : ''}`);
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Initial UI snapshot — Offline until a real probe succeeds. */
export function initialMpcLibrarySnapshot(
  baseUrl = MPC_LIBRARY_DEFAULT_BASE_URL,
): MpcLibraryClientSnapshot {
  assertLoopbackBaseUrl(baseUrl);
  return offlineSnapshot(baseUrl.replace(/\/$/, ''));
}
