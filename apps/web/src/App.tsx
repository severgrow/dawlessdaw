import { useEffect, useState, type ReactNode } from 'react';
import { StatusBar } from './components/StatusBar';
import { DeviceStrip } from './components/DeviceStrip';
import { Nav } from './components/Nav';
import { TransportStrip } from './components/TransportStrip';
import { ConnectWizard } from './components/ConnectWizard';
import { JamMode } from './components/JamMode';
import { PanelSubnav } from './components/PanelSubnav';
import { useBindStudio, useStudioActions, useStudioStore } from './store/useStudioStore';
import { RigWorkspace } from './workspaces/RigWorkspace';
import { ControllerWorkspace } from './workspaces/ControllerWorkspace';
import { SequencerWorkspace } from './workspaces/SequencerWorkspace';
import { SamplesWorkspace } from './workspaces/SamplesWorkspace';
import { SectionsWorkspace } from './workspaces/SectionsWorkspace';
import { CircuitWorkspace } from './workspaces/CircuitWorkspace';
import { SpWorkspace } from './workspaces/SpWorkspace';
import { SessionsWorkspace } from './workspaces/SessionsWorkspace';
import { TestWorkspace } from './workspaces/TestWorkspace';
import { SetupWorkspace } from './workspaces/SetupWorkspace';
import { TimingWorkspace } from './workspaces/TimingWorkspace';
import { MacrosWorkspace } from './workspaces/MacrosWorkspace';
import { MidiLearnGlass } from './components/MidiLearnGlass';
import { WorkspaceErrorBoundary } from './components/WorkspaceErrorBoundary';
import { loadExperimentalUi, saveExperimentalUi, saveWizardDismissed } from './nav/tabs';
import { isTypingTarget } from './nav/shortcuts';
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
  const [jam, setJam] = useState(false);
  const [wizardForce, setWizardForce] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [experimental, setExperimental] = useState(loadExperimentalUi);

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setJam((v) => !v);
      }
      if (e.key === 'Escape' && jam) {
        e.preventDefault();
        setJam(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jam]);

  const openConnect = () => {
    saveWizardDismissed(false);
    setWizardForce(true);
  };

  return (
    <div className={`app app-phase1${jam ? ' jam-open' : ''}`}>
      <StatusBar onOpenConnect={openConnect} connectOpen={wizardOpen} />
      <DeviceStrip onOpenConnect={openConnect} />
      <TransportStrip onOpenJam={() => setJam(true)} onOpenConnect={openConnect} />
      <div className="shell">
        <Nav />
        <main className="main">
          <PanelSubnav workspace={workspace} />

          <WorkspacePanel id="rig" workspace={workspace} onReset={backToRig}>
            <RigWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="controller" workspace={workspace} onReset={backToRig}>
            <ControllerWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sequencer" workspace={workspace} onReset={backToRig}>
            <SequencerWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sp" workspace={workspace} onReset={backToRig}>
            <SpWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="samples" workspace={workspace} onReset={backToRig}>
            <SamplesWorkspace showLoopCatcher />
          </WorkspacePanel>
          <WorkspacePanel id="sections" workspace={workspace} onReset={backToRig}>
            <SectionsWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="circuit" workspace={workspace} onReset={backToRig}>
            <CircuitWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="sessions" workspace={workspace} onReset={backToRig}>
            <SessionsWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="test" workspace={workspace} onReset={backToRig}>
            <TestWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="setup" workspace={workspace} onReset={backToRig}>
            <SetupWorkspace
              onReopenWizard={() => {
                saveWizardDismissed(false);
                setWizardForce(true);
              }}
              experimental={experimental}
              setExperimental={(on) => {
                setExperimental(on);
                saveExperimentalUi(on);
              }}
            />
          </WorkspacePanel>
          <WorkspacePanel id="timing" workspace={workspace} onReset={backToRig}>
            <TimingWorkspace />
          </WorkspacePanel>
          <WorkspacePanel id="macros" workspace={workspace} onReset={backToRig}>
            <MacrosWorkspace />
          </WorkspacePanel>
        </main>
      </div>
      <MidiLearnGlass />
      <ConnectWizard
        forceOpen={wizardForce}
        onClose={() => setWizardForce(false)}
        onOpenChange={setWizardOpen}
      />
      {jam ? <JamMode onClose={() => setJam(false)} /> : null}
      <footer className="footer-bar">
        <span>Splot MIDI Brain · local</span>
        <span className="mono footer-keys" title="Tabs 1–5 · menu QAZ/WSX/EDC · Jam J">
          1–5 · QAZ · J
        </span>
        {/* Pass B: don't repeat “no midi” — StatusBar owns that signal */}
        {midiReady ? <span className="mono live">● midi</span> : null}
      </footer>
    </div>
  );
}
