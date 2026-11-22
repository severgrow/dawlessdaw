import { useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { DeviceStrip } from './components/DeviceStrip';
import { Nav } from './components/Nav';
import { ActiveContext } from './components/ActiveContext';
import { useBindStudio, useStudioActions, useStudioStore } from './store/useStudioStore';
import { StudioWorkspace } from './workspaces/StudioWorkspace';
import { PatchbayWorkspace } from './workspaces/PatchbayWorkspace';
import { PerformanceWorkspace } from './workspaces/PerformanceWorkspace';
import { LibraryWorkspace } from './workspaces/LibraryWorkspace';
import { SessionsWorkspace } from './workspaces/SessionsWorkspace';
import { SettingsWorkspace } from './workspaces/SettingsWorkspace';
import { BenchWorkspace } from './workspaces/BenchWorkspace';
import { BridgeWorkspace } from './workspaces/BridgeWorkspace';
import { SpSamplesWorkspace } from './workspaces/SpSamplesWorkspace';

export function App() {
  useBindStudio();
  const workspace = useStudioStore((s) => s.workspace);
  const midiReady = useStudioStore((s) => s.midiReady);
  const { start } = useStudioActions();

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <div className="app">
      <StatusBar />
      <DeviceStrip />
      <div className="shell">
        <Nav />
        <main className="main">
          {workspace === 'studio' && <StudioWorkspace />}
          {workspace === 'patchbay' && <PatchbayWorkspace />}
          {workspace === 'bridge' && <BridgeWorkspace />}
          {workspace === 'bench' && <BenchWorkspace />}
          {workspace === 'sp-samples' && <SpSamplesWorkspace />}
          {workspace === 'performance' && <PerformanceWorkspace />}
          {workspace === 'library' && <LibraryWorkspace />}
          {workspace === 'sessions' && <SessionsWorkspace />}
          {workspace === 'settings' && <SettingsWorkspace />}
        </main>
        <ActiveContext />
      </div>
      <footer className="footer-bar">
        <span>dawlessdaw · local-first hardware studio · no sysex · no firmware writes</span>
        <span className={`mono ${midiReady ? 'live' : 'err'}`}>
          {midiReady ? '● live web midi' : '● no midi access'}
        </span>
      </footer>
    </div>
  );
}
