import { create } from 'zustand';
import { useEffect } from 'react';
import {
  getStudioRuntime,
  type StudioRuntimeSnapshot,
  type WorkspaceId,
} from '../studio/runtime';
import type {
  BenchVerdict,
  SectionBridgeConfig,
  StudioRoleId,
} from '@dawlessdaw/devices';

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
    enableRoute: (id: string, enabled: boolean) => {
      const routes = runtime.getSnapshot().routes.map((r) =>
        r.id === id ? { ...r, enabled } : r,
      );
      runtime.setRoutes(routes);
    },
    setClockAuthority: (portId: string | null) => runtime.setClockAuthority(portId),
    setRouteClockThroughApp: (on: boolean) => runtime.setRouteClockThroughApp(on),
    assignStudioPort: (
      roleId: StudioRoleId,
      which: 'input' | 'output',
      portId: string | null,
    ) => runtime.assignStudioPort(roleId, which, portId),
    applyMyStudioRoutes: () => runtime.applyMyStudioRoutes(),
    setSectionBridge: (c: SectionBridgeConfig) => runtime.setSectionBridge(c),
    updateSectionBridgeRow: (
      index: number,
      patch: Partial<SectionBridgeConfig['rows'][0]>,
    ) => runtime.updateSectionBridgeRow(index, patch),
    panic: () => runtime.panic(),
    setActiveBench: (id: string | null) => runtime.setActiveBench(id),
    markBench: (id: string, verdict: BenchVerdict, note?: string) =>
      runtime.markBench(id, verdict, note),
    startSceneMidiCapture: () => runtime.startSceneMidiCapture(),
    sendBenchSpProgramChange: (n?: number) => runtime.sendBenchSpProgramChange(n),
    sendBenchMpcProgramChange: (n?: number) => runtime.sendBenchMpcProgramChange(n),
    sendBenchMpcMuteCc: () => runtime.sendBenchMpcMuteCc(),
    sendBenchMpcClockBurst: () => runtime.sendBenchMpcClockBurst(),
    downloadBenchJson: () => runtime.downloadBenchJson(),
    getAssistantTools: () => runtime.assistant.list(),
    getRuntime: () => runtime,
  };
}

export function useBindStudio(): void {
  useEffect(() => bindStudioStore(), []);
}

export type { WorkspaceId, StudioRuntimeSnapshot };
