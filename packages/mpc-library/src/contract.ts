/**
 * Phase C — MPC Library companion HTTP contract.
 * Separate from Network MIDI. Read-only. No shell. No expansion-builder.
 */

export const MPC_LIBRARY_COMPANION_VERSION = '0.1.0-poc';

/** Default loopback port for the local Mac helper. */
export const MPC_LIBRARY_DEFAULT_PORT = 8787;

export const MPC_LIBRARY_DEFAULT_BASE_URL = `http://127.0.0.1:${MPC_LIBRARY_DEFAULT_PORT}`;

/** Companion data source for this PoC. SSH is declared but unavailable until a later opt-in. */
export type MpcLibraryMode = 'fixtures' | 'local-fs' | 'ssh';

export type MpcLibraryEntryKind = 'folder' | 'project' | 'sample' | 'other';

export interface MpcLibraryEntry {
  id: string;
  name: string;
  kind: MpcLibraryEntryKind;
  /** Relative path under the companion root (never an absolute host path in fixtures). */
  relativePath: string;
}

export interface MpcLibrarySshStatus {
  /** Always false in Phase C PoC — contract placeholder for later explicit opt-in. */
  available: boolean;
  optInRequired: true;
  reason: string;
}

export interface MpcLibraryHealth {
  ok: true;
  version: string;
  mode: MpcLibraryMode;
  readOnly: true;
  loopbackOnly: true;
  ssh: MpcLibrarySshStatus;
}

export interface MpcLibraryListResponse {
  rootLabel: string;
  mode: MpcLibraryMode;
  readOnly: true;
  entries: MpcLibraryEntry[];
}

export type MpcLibraryClientStatus =
  | 'offline'
  | 'probing'
  | 'connected'
  | 'error';

export interface MpcLibraryClientSnapshot {
  status: MpcLibraryClientStatus;
  /** Only set when status === 'connected' after a real /health ok. Never invent Connected. */
  health: MpcLibraryHealth | null;
  entries: MpcLibraryEntry[] | null;
  error: string | null;
  baseUrl: string;
}
