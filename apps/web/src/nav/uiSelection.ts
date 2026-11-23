/**
 * Hardware-Feel Pass C — selection carry across Rig / Controller / Setup.
 * UI-only; never touches routing, clock, or SysEx.
 */
import { useSyncExternalStore } from 'react';

export type UiSelection = {
  /** Controller track 1–8 (Rig → Live carry). */
  controllerTrack: number;
  /** Setup role highlight (DeviceStrip / RigMap → Ports). */
  setupRoleId: string | null;
  /** Short sticky chip, e.g. "T3 → SP A". Cleared on dismiss. */
  chip: string | null;
};

const KEY = 'dawlessdaw.uiSelection';

const DEFAULT: UiSelection = {
  controllerTrack: 1,
  setupRoleId: null,
  chip: null,
};

function clampTrack(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, Math.round(n)));
}

function load(): UiSelection {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<UiSelection>;
    return {
      controllerTrack: clampTrack(parsed.controllerTrack ?? 1),
      setupRoleId: typeof parsed.setupRoleId === 'string' ? parsed.setupRoleId : null,
      chip: typeof parsed.chip === 'string' ? parsed.chip : null,
    };
  } catch {
    return { ...DEFAULT };
  }
}

let state: UiSelection = load();
const listeners = new Set<() => void>();

function persist(next: UiSelection): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

export function getUiSelection(): UiSelection {
  return state;
}

export function setUiSelection(patch: Partial<UiSelection>): UiSelection {
  const next: UiSelection = {
    controllerTrack: patch.controllerTrack != null ? clampTrack(patch.controllerTrack) : state.controllerTrack,
    setupRoleId: patch.setupRoleId !== undefined ? patch.setupRoleId : state.setupRoleId,
    chip: patch.chip !== undefined ? patch.chip : state.chip,
  };
  persist(next);
  return next;
}

/** Rig track → Controller with that track selected + optional chip. */
export function carryControllerTrack(track: number, chip?: string | null): void {
  setUiSelection({
    controllerTrack: track,
    chip: chip ?? `T${clampTrack(track)}`,
  });
}

/** DeviceStrip / RigMap → Setup with role row focus. */
export function carrySetupRole(roleId: string | null, chip?: string | null): void {
  setUiSelection({
    setupRoleId: roleId,
    chip: chip ?? (roleId ? `Ports · ${roleId}` : null),
  });
}

export function clearUiChip(): void {
  setUiSelection({ chip: null });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useUiSelection(): UiSelection {
  return useSyncExternalStore(subscribe, getUiSelection, () => DEFAULT);
}
