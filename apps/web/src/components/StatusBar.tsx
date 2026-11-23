import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StatusBar() {
  const snap = useStudioStore();
  const { rescanMidiPorts } = useStudioActions();
  const connected = snap.ports.filter((p) => p.state === 'connected').length;

  return (
    <header className="status-bar">
      <div className="brand" aria-label="Splot MIDI Brain">
        <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" rx="2.5" className="bm-a" />
          <rect x="11" y="1" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="1" y="11" width="8" height="8" rx="2.5" className="bm-b" />
          <rect x="11" y="11" width="8" height="8" rx="2.5" className="bm-c" />
        </svg>
        splot<span className="brand-slash"> / </span>midi brain
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
      <span className="status-line" title={snap.statusLine || snap.midiError || undefined}>
        {snap.midiError
          ? 'No MIDI — allow in Chrome'
          : snap.statusLine.length > 64
            ? `${snap.statusLine.slice(0, 61)}…`
            : snap.statusLine}
      </span>
      <span className="spacer" />
      <button
        type="button"
        onClick={() => void rescanMidiPorts()}
        title="Ask Chrome for the MIDI port list again"
      >
        Rescan
      </button>
    </header>
  );
}
