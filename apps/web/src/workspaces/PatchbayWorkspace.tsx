import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { formatRouteChannelDetail } from './routeChannelDetail';

export function PatchbayWorkspace() {
  const snap = useStudioStore();
  const { enableRoute, setClockAuthority } = useStudioActions();

  return (
    <div className="section-enter">
      <h1>Patchbay</h1>
      <p className="lead">
        MIDI routes with channel filter, transforms, multi-dest, and clock authority separated from
        note traffic.
      </p>

      <div className="panel">
        <h2>Ports</h2>
        <p className="muted">
          Exact list Chrome Web MIDI reports. If a device (e.g. MPC One) is missing here, fix USB /
          Audio MIDI Setup / power — Dawlessdaw cannot invent ports the browser does not see. Odd
          names (e.g. Felucca for FM1) still appear here; assign them under Settings.
        </p>
        {snap.ports.length === 0 ? (
          <p className="muted mono">No ports from Web MIDI yet.</p>
        ) : (
          snap.ports.map((p) => (
            <div key={p.id} className="list-row">
              <div>
                <strong>{p.name}</strong>
                <div className="path">
                  {p.id} · {p.type} · {p.state}
                </div>
              </div>
              {p.type === 'input' ? (
                <button
                  type="button"
                  className={snap.clockAuthorityPortId === p.id ? 'active' : 'ghost'}
                  onClick={() =>
                    setClockAuthority(snap.clockAuthorityPortId === p.id ? null : p.id)
                  }
                >
                  Clock
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>Routes</h2>
        {snap.routes.map((r) => (
          <div key={r.id} className="route-row">
            <div>
              <div>{r.name}</div>
              <div className="path">
                {r.sourcePortId} → {r.destinations.map((d) => d.portId).join(' + ')}
                {formatRouteChannelDetail(r.channel)}
                {r.note?.transpose ? ` · transpose ${r.note.transpose}` : ''}
              </div>
            </div>
            <button
              type="button"
              aria-pressed={r.enabled}
              onClick={() => enableRoute(r.id, !r.enabled)}
            >
              {r.enabled ? 'On' : 'Off'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
