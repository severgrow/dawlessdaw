import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function PerformanceWorkspace() {
  const snap = useStudioStore();
  const { setFocusMode } = useStudioActions();

  return (
    <div className="section-enter">
      <h1>Performance</h1>
      <p className="lead">
        Follow the playing machine. Clock ticks never steal focus. Pin when you need a locked
        surface.
      </p>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button type="button" onClick={() => setFocusMode('follow')}>
          Follow
        </button>
        <button type="button" onClick={() => setFocusMode('smart')}>
          Smart
        </button>
      </div>
      <div className="grid-2">
        {snap.devices
          .filter((d) => d.midiEnabled)
          .map((d) => (
            <div key={d.id} className="panel">
              <h2>{d.displayName}</h2>
              <p className="muted mono">
                {snap.focus.activeDeviceId === d.id ? 'FOCUS' : 'idle'}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
