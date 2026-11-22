import { useStudioStore } from '../store/useStudioStore';

export function ActiveContext() {
  const snap = useStudioStore();
  const device = snap.devices.find((d) => d.id === snap.focus.activeDeviceId);
  const soft = snap.devices.find((d) => d.id === snap.focus.softFocus?.deviceId);

  return (
    <aside className="side">
      <h2>Active context</h2>
      {device ? (
        <div className="panel section-enter">
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <span className={`indicator ${device.connected ? 'on' : ''}`} />
            <strong>{device.displayName}</strong>
          </div>
          <p className="muted mono" style={{ marginTop: 0 }}>
            {device.kind}
            {device.firmwareProfile ? ` / ${device.firmwareProfile}` : ''}
          </p>
          <p className="lead" style={{ marginBottom: '0.5rem' }}>
            Focus: {snap.focus.mode}
            {snap.focus.pinnedDeviceId ? ' · pinned' : ''}
          </p>
          <ul className="cap-list">
            {device.capabilities.map((c) => (
              <li key={c.id}>
                <span className={`cap-dot ${c.status}`} />
                <strong>{c.label}</strong>
                <div className="muted mono">{c.status}</div>
                {c.notes ? <div className="muted">{c.notes}</div> : null}
              </li>
            ))}
          </ul>
          {!device.midiEnabled ? (
            <p className="lead">USB audio capture only — no MIDI control.</p>
          ) : null}
        </div>
      ) : (
        <p className="muted">No focused device</p>
      )}

      {soft ? (
        <div className="panel">
          <h2>Soft focus</h2>
          <p className="mono">{soft.displayName}</p>
        </div>
      ) : null}

      <div className="panel">
        <h2>Recent</h2>
        <ul className="event-log">
          {snap.recentUiEvents.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="muted">{new Date(e.at).toLocaleTimeString()}</span> {e.summary}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
