import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar() {
  const snap = useStudioStore();
  const { rescanMidiPorts } = useStudioActions();
  const connected = snap.ports.filter((p) => p.state === 'connected').length;

  return (
    <header className="status-bar">
      <div className="brand" aria-label="Dawlessdaw">
        dawless<span className="brand-slash">/</span>daw
        <span className="cursor" aria-hidden="true" />
      </div>
      <div className={snap.midiReady ? 'sim-badge live-badge' : 'sim-badge error-badge'}>
        <span className="dot" />
        {snap.midiReady ? 'midi' : 'no midi'}
      </div>
      <span className="readout">
        ports <b>{connected}</b>
      </span>
      {snap.anyClockForwarding ? (
        <span className="readout" title={snap.clockActivity.hint}>
          clk <b>{snap.clockActivity.inTicks}</b>↓ <b>{snap.clockActivity.outTicks}</b>↑
        </span>
      ) : null}
      <span className="status-line">{snap.statusLine}</span>
      <span className="spacer" />
      <button
        type="button"
        onClick={() => void rescanMidiPorts()}
        title="Ask Chrome for the MIDI port list again"
      >
        rescan
      </button>
    </header>
  );
}
