import { useEffect } from 'react';
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

export function App() {
  useBindStudio();
  const workspace = useStudioStore((s) => s.workspace);
  const midiReady = useStudioStore((s) => s.midiReady);
  const { start, setWorkspace } = useStudioActions();

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
          <WorkspaceErrorBoundary workspace={workspace} onReset={() => setWorkspace('rig')}>
            {workspace === 'rig' && <RigWorkspace />}
            {workspace === 'controller' && <ControllerWorkspace />}
            {workspace === 'sequencer' && <SequencerWorkspace />}
            {workspace === 'samples' && <SamplesWorkspace />}
            {workspace === 'sections' && <SectionsWorkspace />}
            {workspace === 'sessions' && <SessionsWorkspace />}
            {workspace === 'test' && <TestWorkspace />}
            {workspace === 'setup' && <SetupWorkspace />}
          </WorkspaceErrorBoundary>
        </main>
      </div>
      <MidiLearnGlass />
      <footer className="footer-bar">
        <span>dawless/daw MIDI Brain · local · no sysex</span>
        <span className={`mono ${midiReady ? 'live' : 'err'}`}>
          {midiReady ? '● live web midi' : '● no midi access'}
        </span>
      </footer>
    </div>
  );
}
