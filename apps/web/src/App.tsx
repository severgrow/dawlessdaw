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

export function App() {
  useBindStudio();
  const workspace = useStudioStore((s) => s.workspace);
  const simulation = useStudioStore((s) => s.simulation);
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
          {workspace === 'performance' && <PerformanceWorkspace />}
          {workspace === 'library' && <LibraryWorkspace />}
          {workspace === 'sessions' && <SessionsWorkspace />}
          {workspace === 'settings' && <SettingsWorkspace />}
        </main>
        <ActiveContext />
      </div>
      <footer className="footer-bar">
        <span>NervOS v0.1 · local-first studio connectivity</span>
        <span className="mono">
          {simulation ? 'SIMULATION — not live hardware' : 'LIVE WEB MIDI'}
        </span>
      </footer>
    </div>
  );
}
