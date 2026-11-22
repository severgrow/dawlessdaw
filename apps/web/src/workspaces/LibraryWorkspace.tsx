import { DEVICE_PROFILES } from '@nervos/devices';
import { useStudioStore } from '../store/useStudioStore';

export function LibraryWorkspace() {
  const snap = useStudioStore();

  return (
    <div className="section-enter">
      <h1>Library</h1>
      <p className="lead">Device profiles and honest capability status. Nothing invented.</p>

      <div className="panel">
        <h2>Profiles</h2>
        {Object.values(DEVICE_PROFILES).map((p) => (
          <div key={p.kind + p.displayName} className="list-row">
            <div>
              <strong>{p.displayName}</strong>
              <div className="path">
                MIDI={String(p.hasMidi)} · audio={String(p.hasAudioCapture)}
              </div>
              <ul className="cap-list">
                {p.capabilities.map((c) => (
                  <li key={c.id}>
                    <span className={`cap-dot ${c.status}`} />
                    {c.label} <span className="mono muted">({c.status})</span>
                    {c.notes ? <div className="muted">{c.notes}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Device panels</h2>
        {snap.devices.map((d) => (
          <DevicePanel key={d.id} deviceId={d.id} />
        ))}
      </div>
    </div>
  );
}

function DevicePanel({ deviceId }: { deviceId: string }) {
  const snap = useStudioStore();
  const d = snap.devices.find((x) => x.id === deviceId);
  if (!d) return null;
  return (
    <div className="panel" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '0.75rem' }}>
      <h2>{d.displayName}</h2>
      <p className="muted">
        {d.midiEnabled
          ? `In: ${d.inputPortIds.join(', ') || '—'} · Out: ${d.outputPortIds.join(', ') || '—'}`
          : 'No MIDI — Allen & Heath ZED-10FX is USB audio capture only.'}
      </p>
    </div>
  );
}
