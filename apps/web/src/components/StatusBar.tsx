import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar() {
  const snap = useStudioStore();
  const { setSimulation } = useStudioActions();

  return (
    <header className="status-bar">
      <div className="brand">NervOS</div>
      <div className={snap.simulation ? 'sim-badge' : 'sim-badge live-badge'}>
        <span className="dot" />
        {snap.simulation ? 'Simulation' : 'Live MIDI'}
      </div>
      <span className="muted mono">{snap.transportKind}</span>
      <span className="muted" style={{ flex: 1 }}>
        {snap.statusLine}
      </span>
      <button
        type="button"
        aria-pressed={snap.simulation}
        onClick={() => void setSimulation(!snap.simulation)}
      >
        {snap.simulation ? 'Switch to Live' : 'Switch to Sim'}
      </button>
    </header>
  );
}
