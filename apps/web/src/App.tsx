import { useEffect, type ReactNode } from 'react';
import { StatusBar } from './components/StatusBar';
import { DeviceStrip } from './components/DeviceStrip';
import { Nav } from './components/Nav';
import { useBindStudio, useStudioActions, useStudioStore } from './store/useStudioStore';
import { RigWorkspace } from './workspaces/RigWorkspace';
import { ControllerWorkspace } from './workspaces/ControllerWorkspace';
import { SequencerWorkspace } from './workspaces/SequencerWorkspace';
import { SamplesWorkspace } from './workspaces/SamplesWorkspace';
import { SectionsWorkspace } from './workspaces/SectionsWorkspace';
import { SessionsWorkspace } from './workspaces/SessionsWorkspace';
import { TestWorkspace } from './workspaces/TestWorkspace';
import { SetupWorkspace } from './workspaces/SetupWorkspace';
import { MidiLearnGlass } from './components/MidiLearnGlass';
import { WorkspaceErrorBoundary } from './components/WorkspaceErrorBoundary';
import type { WorkspaceId } from './studio/runtime';

function WorkspacePanel({
  id,
  workspace,
  onReset,
  children,
}: {
  id: WorkspaceId;
  workspace: WorkspaceId;
  onReset: () => void;
  children: ReactNode;
}) {
  if (workspace !== id) return null;
  return (
    <WorkspaceErrorBoundary workspace={id} onReset={onReset}>
      {children}
    </WorkspaceErrorBoundary>
  );
}

export function App() {
  useBindStudio();
  const workspace = useStudioStore((s) => s.workspace);
  const midiReady = useStudioStore((s) => s.midiReady);
  const { start, setWorkspace } = useStudioActions();
  const backToRig = () => setWorkspace('rig');

  // Start Web MIDI once. (`start` is a new function each render; as a dependency
  // it re-ran on every update and, after a refused MIDI request, retried forever.)
  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <StatusBar />
      <DeviceStrip />
      <div className="shell">
        <Nav />
        <main className="main">
          <WorkspacePanel id="rig" workspace={workspace} onReset={backToRig}>
            <RigWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="controller" workspace={workspace} onReset={backToRig}>
            <ControllerWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sequencer" workspace={workspace} onReset={backToRig}>
            <SequencerWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="samples" workspace={workspace} onReset={backToRig}>
            <SamplesWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sections" workspace={workspace} onReset={backToRig}>
            <SectionsWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sessions" workspace={workspace} onReset={backToRig}>
            <SessionsWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="test" workspace={workspace} onReset={backToRig}>
            <TestWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="setup" workspace={workspace} onReset={backToRig}>
            <SetupWorkspace />
          </WorkspacePanel>
        </main>
      </div>
      <MidiLearnGlass />
      <footer className="footer-bar">
        <span>Splot MIDI Brain · local · no sysex</span>
        <span className={`mono ${midiReady ? 'live' : 'err'}`}>
          {midiReady ? '● live web midi' : '● no midi access'}
        </span>
      </footer>
    </div>
  );
}
