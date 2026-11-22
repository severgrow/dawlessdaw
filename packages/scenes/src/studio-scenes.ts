import type { DeviceId, FocusMode, SceneId } from '@nervos/core';
import type { MidiRoute, RoutingPreset } from '@nervos/routing';
import type { RoleBinding } from '@nervos/core';
import type { ArrangerConfig } from './arranger';

export interface StudioScene {
  id: SceneId;
  name: string;
  createdAt: number;
  updatedAt: number;
  routes: MidiRoute[];
  clockAuthorityPortId: string | null;
  roles: RoleBinding[];
  focusMode: FocusMode;
  pinnedDeviceId: DeviceId | null;
  activeDeviceId: DeviceId | null;
  arranger: ArrangerConfig;
  notes?: string;
}

export interface SceneValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warn';
}

export function validateScene(
  scene: StudioScene,
  knownPortIds: Set<string>,
  knownDeviceIds: Set<string>,
): SceneValidationIssue[] {
  const issues: SceneValidationIssue[] = [];
  if (!scene.id) issues.push({ path: 'id', message: 'Scene id required', severity: 'error' });
  if (!scene.name.trim())
    issues.push({ path: 'name', message: 'Scene name required', severity: 'error' });

  for (const route of scene.routes) {
    if (!knownPortIds.has(route.sourcePortId)) {
      issues.push({
        path: `routes.${route.id}.sourcePortId`,
        message: `Unknown source port ${route.sourcePortId}`,
        severity: 'warn',
      });
    }
    for (const d of route.destinations) {
      if (!knownPortIds.has(d.portId)) {
        issues.push({
          path: `routes.${route.id}.dest.${d.portId}`,
          message: `Unknown destination port ${d.portId}`,
          severity: 'warn',
        });
      }
    }
  }

  for (const role of scene.roles) {
    if (!knownDeviceIds.has(role.sourceDeviceId)) {
      issues.push({
        path: `roles.${role.roleId}`,
        message: `Unknown source device ${role.sourceDeviceId}`,
        severity: 'warn',
      });
    }
  }

  if (scene.arranger.hardwareSceneSync !== false) {
    issues.push({
      path: 'arranger.hardwareSceneSync',
      message: 'Hardware Scene Sync must be false in v0.1',
      severity: 'error',
    });
  }

  return issues;
}

export class SceneStore {
  private scenes = new Map<SceneId, StudioScene>();
  private activeSceneId: SceneId | null = null;

  list(): StudioScene[] {
    return [...this.scenes.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: SceneId): StudioScene | undefined {
    return this.scenes.get(id);
  }

  getActiveId(): SceneId | null {
    return this.activeSceneId;
  }

  save(scene: StudioScene): void {
    this.scenes.set(scene.id, {
      ...scene,
      updatedAt: Date.now(),
      arranger: { ...scene.arranger, hardwareSceneSync: false },
    });
  }

  remove(id: SceneId): void {
    this.scenes.delete(id);
    if (this.activeSceneId === id) this.activeSceneId = null;
  }

  recall(id: SceneId): StudioScene | null {
    const scene = this.scenes.get(id);
    if (!scene) return null;
    this.activeSceneId = id;
    return {
      ...scene,
      routes: scene.routes.map((r) => ({
        ...r,
        destinations: r.destinations.map((d) => ({ ...d })),
      })),
      roles: scene.roles.map((r) => ({
        ...r,
        destinationDeviceIds: [...r.destinationDeviceIds],
        destinationPortIds: [...r.destinationPortIds],
      })),
      arranger: { ...scene.arranger, hardwareSceneSync: false },
    };
  }

  fromRoutingPreset(
    preset: RoutingPreset,
    extras: Omit<StudioScene, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'routes' | 'clockAuthorityPortId'>,
    id: SceneId,
    name: string,
  ): StudioScene {
    const now = Date.now();
    return {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      routes: preset.routes,
      clockAuthorityPortId: preset.clockAuthorityPortId,
      ...extras,
      arranger: { ...extras.arranger, hardwareSceneSync: false },
    };
  }
}
