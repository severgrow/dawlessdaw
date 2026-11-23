import { create } from 'zustand';
import { useEffect } from 'react';
import {
  getStudioRuntime,
  type StudioRuntimeSnapshot,
  type WorkspaceId,
} from '../studio/runtime';
import { getStudioCommands } from '../studio/commandsBind';
import type {
  BenchVerdict,
  SectionBridgeConfig,
  StudioRoleId,
  TrackDestId,
  TrackPresetId,
  CtrlTrack,
  KnobSlot,
} from '@dawlessdaw/devices';

const runtime = getStudioRuntime();

/** Browser-local memory of the last open tab (a convenience; ignored if storage is blocked). */
export const LAST_TAB_KEY = 'dawlessdaw.lastTab';
const TABS: readonly WorkspaceId[] = [
  'rig',
  'controller',
  'sequencer',
  'samples',
  'sections',
  'circuit',
  'sp',
  'mpc',
  'sessions',
  'test',
  'setup',
  'timing',
  'macros',
];
try {
  const last = localStorage.getItem(LAST_TAB_KEY) as WorkspaceId | null;
  if (last && TABS.includes(last)) runtime.setWorkspace(last);
} catch {
  // storage unavailable
}

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
    rescanMidiPorts: () => runtime.rescanMidiPorts(),
    setWorkspace: (w: WorkspaceId) => runtime.setWorkspace(w),
    selectDevice: (id: string) => runtime.selectDevice(id),
    saveScene: (name: string) => runtime.saveScene(name),
    recallScene: (id: string) => runtime.recallScene(id),
    exportSession: () => runtime.exportSession(),
    importSession: (raw: string) => runtime.importSession(raw),
    enableRoute: (id: string, enabled: boolean) => {
      getStudioCommands().enableRoute(id, enabled);
    },
    setRoute: (route: import('@dawlessdaw/routing').MidiRoute) => {
      getStudioCommands().setRoute(route);
    },
    setRoutes: (routes: import('@dawlessdaw/routing').MidiRoute[]) => {
      getStudioCommands().setRoutes(routes);
    },
    captureRecentBars: (bars?: import('@dawlessdaw/midi').CaptureBarCount) =>
      getStudioCommands().captureRecentBars(bars ?? 8),
    getCommands: () => getStudioCommands(),
    setClockAuthority: (portId: string | null) => runtime.setClockAuthority(portId),
    setClockToMpc: (on: boolean) => runtime.setClockToMpc(on),
    setClockToSp: (on: boolean) => runtime.setClockToSp(on),
    setFm1Firmware: (firmware: 'skiff' | 'h1') => runtime.setFm1Firmware(firmware),
    setMpcNoteMode: (mode: 'usb' | 'din-only') => runtime.setMpcNoteMode(mode),
    setForwardClockToFm1: (on: boolean) => runtime.setForwardClockToFm1(on),
    setTrackSend: (track: number, dest: TrackDestId, channel: number | null) =>
      runtime.setTrackSend(track, dest, channel),
    applyTrackPreset: (id: TrackPresetId) => runtime.applyTrackPreset(id),
    setControllerTrack: (t: number, patch: Partial<CtrlTrack>) => runtime.setControllerTrack(t, patch),
    setControllerKnob: (t: number, k: number, patch: Partial<KnobSlot>) => runtime.setControllerKnob(t, k, patch),
    setSkiffChannel: (skiffTrack: number, ch: number) => runtime.setSkiffChannel(skiffTrack, ch),
    copyControllerTrack: (from: number, to: number[]) => runtime.copyControllerTrack(from, to),
    undoController: () => runtime.undoController(),
    seqPlay: () => runtime.seqPlay(),
    seqStop: () => runtime.seqStop(),
    seqToggleRecord: () => runtime.seqToggleRecord(),
    seqSetClockSource: (source: import('@dawlessdaw/sequencer').SeqClockSource) =>
      runtime.seqSetClockSource(source),
    seqSetActivePattern: (index: number) => runtime.seqSetActivePattern(index),
    seqSetLength: (length: number) => runtime.seqSetLength(length),
    seqSetBpm: (bpm: number) => runtime.seqSetBpm(bpm),
    seqClickToggle: (track: number, step: number) => runtime.seqClickToggle(track, step),
    seqSetStep: (
      track: number,
      step: number,
      patch: Partial<{ pitch: number; velocity: number; gate: number; on: boolean }>,
    ) => runtime.seqSetStep(track, step, patch),
    seqSelectCell: (track: number, step: number) => runtime.seqSelectCell(track, step),
    seqSetTrackMute: (track: number, muted: boolean) => runtime.seqSetTrackMute(track, muted),
    seqSetTrackSolo: (track: number, solo: boolean) => runtime.seqSetTrackSolo(track, solo),
    seqSetTrackDefaults: (
      track: number,
      patch: Partial<{ defaultPitch: number; defaultVelocity: number; defaultGate: number }>,
    ) => runtime.seqSetTrackDefaults(track, patch),
    seqUndo: () => runtime.seqUndo(),
    seqRedo: () => runtime.seqRedo(),
    setHearOnCircuit: (on: boolean) => runtime.setHearOnCircuit(on),
    genSetSettings: (patch: Partial<import('@dawlessdaw/sequencer').GenerativeSettings>) =>
      runtime.genSetSettings(patch),
    genCaptureFromMirror: () => runtime.genCaptureFromMirror(),
    genCaptureFromPattern: () => runtime.genCaptureFromPattern(),
    genGenerate: () => runtime.genGenerate(),
    genMutate: () => runtime.genMutate(),
    genResetToSource: () => runtime.genResetToSource(),
    genUndo: () => runtime.genUndo(),
    genToggleLock: (track: number, step: number) => runtime.genToggleLock(track, step),
    genEditStep: (
      track: number,
      step: number,
      patch: Partial<{ pitch: number; velocity: number; gate: number; on: boolean }>,
    ) => runtime.genEditStep(track, step, patch),
    loadControllerPreset: (id: string) => runtime.loadControllerPreset(id),
    saveControllerPreset: () => runtime.saveControllerPreset(),
    saveControllerPresetAs: (name: string) => runtime.saveControllerPresetAs(name),
    renameControllerPreset: (id: string, name: string) => runtime.renameControllerPreset(id, name),
    deleteControllerPreset: (id: string) => runtime.deleteControllerPreset(id),
    learnFirstNote: (t: number) => runtime.learnFirstNote(t),
    twistToPick: (t: number, k: number) => runtime.twistToPick(t, k),
    cancelControllerLearn: () => runtime.cancelControllerLearn(),
    dismissMidiLearnGlass: () => runtime.dismissMidiLearnGlass(),
    saveMidiLearnGlass: () => runtime.saveMidiLearnGlass(),
    cancelMidiLearnGlass: () => runtime.cancelMidiLearnGlass(),
    setMidiLearnPinned: (pinned: boolean) => runtime.setMidiLearnPinned(pinned),
    snoozeMidiLearnGlass: (ms?: number) => runtime.snoozeMidiLearnGlass(ms),
    startMidiLearnReassign: () => runtime.startMidiLearnReassign(),
    testControllerKnob: (t: number, k: number) => runtime.testControllerKnob(t, k),
    setSpNoteOffset: (n: number) => runtime.setSpNoteOffset(n),
    learnSpPadOffset: () => runtime.learnSpPadOffset(),
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
    reorderSectionBridgeRows: (from: number, to: number) =>
      runtime.reorderSectionBridgeRows(from, to),
    resetCircuitLiveTicks: () => runtime.resetCircuitLiveTicks(),
    setCircuitProjectSlot: (
      index: number,
      patch: Partial<{ name: string; colour: string }>,
    ) => runtime.setCircuitProjectSlot(index, patch),
    setControllerKnobPickup: (on: boolean) => runtime.setControllerKnobPickup(on),
    resetSpLiveTicks: () => runtime.resetSpLiveTicks(),
    setSpEffectChannel: (ch: number) => runtime.setSpEffectChannel(ch),
    nameSpEffectKnob: (cc: number, label: string) => runtime.nameSpEffectKnob(cc, label),
    markSpEffectNamesVerified: (on: boolean) => runtime.markSpEffectNamesVerified(on),
    startSpEffectSweep: (cc?: number) => runtime.startSpEffectSweep(cc),
    stopSpEffectSweep: () => runtime.stopSpEffectSweep(),
    panic: () => {
      getStudioCommands().panic();
    },
    setActiveBench: (id: string | null) => runtime.setActiveBench(id),
    markBench: (id: string, verdict: BenchVerdict, note?: string) =>
      runtime.markBench(id, verdict, note),
    startSceneMidiCapture: () => runtime.startSceneMidiCapture(),
    sendBenchSpProgramChange: (n?: number) => runtime.sendBenchSpProgramChange(n),
    sendBenchMpcProgramChange: (n?: number) => runtime.sendBenchMpcProgramChange(n),
    sendBenchMpcMuteCc: () => runtime.sendBenchMpcMuteCc(),
    sendBenchMpcClockBurst: () => runtime.sendBenchMpcClockBurst(),
    downloadBenchJson: () => runtime.downloadBenchJson(),
    createCustomDevice: (input: {
      displayName: string;
      manufacturer?: string;
      category?: import('@dawlessdaw/devices').DeviceCategory;
      colour?: string;
      channel?: number;
      inputPortId?: string | null;
      outputPortId?: string | null;
      honesty?: import('@dawlessdaw/devices').ProfileHonesty;
      notes?: string;
    }) => runtime.createCustomDevice(input),
    deleteCustomProfile: (id: string) => runtime.deleteCustomProfile(id),
    assignCustomProfilePort: (
      profileId: string,
      which: 'input' | 'output',
      portId: string | null,
    ) => runtime.assignCustomProfilePort(profileId, which, portId),
    addCustomControl: (profileId: string, label: string) =>
      runtime.addCustomControl(profileId, label),
    removeCustomControl: (profileId: string, controlId: string) =>
      runtime.removeCustomControl(profileId, controlId),
    startGenericLearn: (profileId: string, controlId: string) =>
      runtime.startGenericLearn(profileId, controlId),
    cancelGenericLearn: () => runtime.cancelGenericLearn(),
    exportCustomProfilesJson: () => runtime.exportCustomProfilesJson(),
    importCustomProfilesJson: (raw: string) => runtime.importCustomProfilesJson(raw),
    getAssistantTools: () => runtime.assistant.list(),
    getRuntime: () => runtime,
  };
}

export function useBindStudio(): void {
  useEffect(() => bindStudioStore(), []);
}

export type { WorkspaceId, StudioRuntimeSnapshot };
