import { create } from 'zustand';
import { useEffect } from 'react';
import {
  getStudioRuntime,
  type StudioRuntimeSnapshot,
  type WorkspaceId,
} from '../studio/runtime';

const runtime = getStudioRuntime();

interface StudioZustandState extends StudioRuntimeSnapshot {
  hydrate: () => void;
}

function snapshot(): StudioRuntimeSnapshot {
  return runtime.getSnapshot();
}

export const useStudioStore = create<StudioZustandState>((set) => ({
  ...snapshot(),
  hydrate: () => set({ ...snapshot() }),
}));

/** Bind runtime notifications into Zustand (call once from App). */
export function bindStudioStore(): () => void {
  const sync = () => useStudioStore.getState().hydrate();
  sync();
  return runtime.subscribe(sync);
}

export function useStudioActions() {
  return {
    start: () => runtime.start(),
    setSimulation: (on: boolean) => runtime.setSimulation(on),
    setWorkspace: (w: WorkspaceId) => runtime.setWorkspace(w),
    setFocusMode: (m: 'follow' | 'smart' | 'manual') => runtime.setFocusMode(m),
    pinDevice: (id: string | null) => runtime.pinDevice(id),
    selectDevice: (id: string) => runtime.selectDevice(id),
    playFixture: () => runtime.playFixture(),
    playProjectChangeFixture: () => runtime.playProjectChangeFixture(),
    injectNote: (portId: string, note?: number) => runtime.injectNote(portId, note),
    saveScene: (name: string) => runtime.saveScene(name),
    recallScene: (id: string) => runtime.recallScene(id),
    exportSession: () => runtime.exportSession(),
    importSession: (raw: string) => runtime.importSession(raw),
    configureCircuitArranger: () => runtime.configureCircuitArranger(),
    enableRoute: (id: string, enabled: boolean) => {
      const routes = runtime.getSnapshot().routes.map((r) =>
        r.id === id ? { ...r, enabled } : r,
      );
      runtime.setRoutes(routes);
    },
    setClockAuthority: (portId: string | null) => runtime.setClockAuthority(portId),
    getAssistantTools: () => runtime.assistant.list(),
    getRuntime: () => runtime,
  };
}

/** Hook: keep Zustand in sync for the lifetime of the tree. */
export function useBindStudio(): void {
  useEffect(() => bindStudioStore(), []);
}

export type { WorkspaceId, StudioRuntimeSnapshot };
