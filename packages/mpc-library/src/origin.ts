/**
 * Origin / bind guards for the Library companion.
 * Loopback only — never bind 0.0.0.0. Origin-checked for browser callers.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return LOOPBACK_HOSTS.has(h) || LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/** Parse hostname from a URL or Host header value (`localhost:5173`). */
export function hostnameFromHostHeader(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const raw = hostHeader.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end > 0) return raw.slice(1, end);
  }
  const colon = raw.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) return raw.slice(0, colon);
  return raw;
}

export function isAllowedCompanionOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

/** Reject non-loopback bind hosts (safety for the companion process). */
export function assertLoopbackBindHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new Error(
      `MPC Library companion refuses non-loopback bind “${host}” — use 127.0.0.1 only`,
    );
  }
}

/** Base URL must be http(s) to a loopback host. */
export function assertLoopbackBaseUrl(baseUrl: string): URL {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid companion base URL: ${baseUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Companion URL must be http(s), got ${u.protocol}`);
  }
  if (!isLoopbackHost(u.hostname)) {
    throw new Error(`Companion URL must target loopback, got ${u.hostname}`);
  }
  return u;
}
