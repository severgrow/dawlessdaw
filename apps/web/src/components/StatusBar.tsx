import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar() {
  const snap = useStudioStore();
  const { setSimulation } = useStudioActions();

  return (
    <header className="status-bar">
      <div className="brand" aria-label="Dawlessdaw">
        dawless<span className="brand-slash">/</span>daw
        <span className="cursor" aria-hidden="true" />
      </div>
      <div className={snap.simulation ? 'sim-badge' : 'sim-badge live-badge'}>
        <span className="dot" />
        {snap.simulation ? 'sim' : 'live'}
      </div>
      <span className="readout">
        io <b>{snap.transportKind}</b>
      </span>
      {snap.routeClockThroughApp ? (
        <span className="readout" title={snap.clockActivity.hint}>
          clk <b>{snap.clockActivity.inTicks}</b>↓ <b>{snap.clockActivity.outTicks}</b>↑
        </span>
      ) : null}
      <span className="status-line">{snap.statusLine}</span>
      <span className="spacer" />
      <button
        type="button"
        onClick={() => void setSimulation(!snap.simulation)}
        title="Toggle between simulated ports and real Web MIDI"
      >
        {snap.simulation ? 'go live' : 'go sim'}
      </button>
    </header>
  );
}
