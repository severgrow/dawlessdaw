import { SCHEMA_VERSION, type SessionId } from '@nervos/core';
import type { StudioScene } from '@nervos/scenes';
import type { RoutingPreset } from '@nervos/routing';
import type { RoleBinding } from '@nervos/core';
import type { ArrangerConfig } from '@nervos/scenes';
import type { FocusMode } from '@nervos/core';

export interface NervosSession {
  schemaVersion: typeof SCHEMA_VERSION;
  id: SessionId;
  name: string;
  createdAt: number;
  updatedAt: number;
  simulation: boolean;
  scenes: StudioScene[];
  activeSceneId: string | null;
  routingPresets: RoutingPreset[];
  roles: RoleBinding[];
  arranger: ArrangerConfig;
  focusMode: FocusMode;
  pinnedDeviceId: string | null;
  notes?: string;
}

export interface SessionParseResult {
  ok: boolean;
  session?: NervosSession;
  errors: string[];
}

export function createEmptySession(name: string, simulation = true): NervosSession {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `session-${now}`,
    name,
    createdAt: now,
    updatedAt: now,
    simulation,
    scenes: [],
    activeSceneId: null,
    routingPresets: [],
    roles: [],
    arranger: {
      kind: 'none',
      deviceId: null,
      label: 'No arranger',
      hardwareSceneSync: false,
    },
    focusMode: 'follow',
    pinnedDeviceId: null,
  };
}

export function exportSessionJson(session: NervosSession): string {
  return JSON.stringify(
    { ...session, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() },
    null,
    2,
  );
}

export function importSessionJson(raw: string): SessionParseResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['Session must be an object'] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion ${String(obj.schemaVersion)} (expected ${SCHEMA_VERSION})`,
    );
  }
  if (typeof obj.id !== 'string' || !obj.id) errors.push('id required');
  if (typeof obj.name !== 'string') errors.push('name required');
  if (!Array.isArray(obj.scenes)) errors.push('scenes must be an array');
  if (!Array.isArray(obj.routingPresets)) errors.push('routingPresets must be an array');

  const arranger = obj.arranger as ArrangerConfig | undefined;
  if (arranger && (arranger as { hardwareSceneSync?: boolean }).hardwareSceneSync === true) {
    errors.push('hardwareSceneSync cannot be true');
  }

  if (errors.length) return { ok: false, errors };

  const session: NervosSession = {
    schemaVersion: SCHEMA_VERSION,
    id: obj.id as string,
    name: obj.name as string,
    createdAt: Number(obj.createdAt) || Date.now(),
    updatedAt: Number(obj.updatedAt) || Date.now(),
    simulation: Boolean(obj.simulation),
    scenes: obj.scenes as StudioScene[],
    activeSceneId: (obj.activeSceneId as string) ?? null,
    routingPresets: obj.routingPresets as RoutingPreset[],
    roles: (obj.roles as RoleBinding[]) ?? [],
    arranger: {
      kind: arranger?.kind ?? 'none',
      deviceId: arranger?.deviceId ?? null,
      label: arranger?.label ?? 'No arranger',
      hardwareSceneSync: false,
    },
    focusMode: (obj.focusMode as FocusMode) ?? 'follow',
    pinnedDeviceId: (obj.pinnedDeviceId as string) ?? null,
    notes: obj.notes as string | undefined,
  };
  return { ok: true, session, errors: [] };
}
