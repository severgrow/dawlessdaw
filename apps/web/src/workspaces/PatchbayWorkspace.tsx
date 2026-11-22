import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { formatRouteChannelDetail } from './routeChannelDetail';

function ageLabel(at: number | null): string {
  if (at == null) return '—';
  const ms = Date.now() - at;
  if (ms < 800) return 'live';
  if (ms < 3000) return `${(ms / 1000).toFixed(1)}s ago`;
  return 'idle';
}

export function PatchbayWorkspace() {
  const snap = useStudioStore();
  const { enableRoute, setClockAuthority } = useStudioActions();
  const clock = snap.clockActivity;
  const clockRoute = snap.routes.find((r) => r.id === 'mystudio-clock' || r.forwardClock);

  return (
    <div className="section-enter">
      <h1>Patchbay</h1>
      <p className="lead">
        MIDI routes with channel filter, transforms, multi-dest, and clock authority separated from
        note traffic.
      </p>

      <div className="panel">
        <h2>USB clock monitor</h2>
        <p className="muted">
          While Circuit plays: IN should show <span className="mono">start</span> then ticking{' '}
          <span className="mono">clock</span>. With App clock forwarding ON, OUT should rise on MPC
          / SP. Updates ~5×/s (not every F8).
        </p>
        <div className="row" style={{ gap: '1.25rem', flexWrap: 'wrap' }}>
          <div className="mono">
            IN {clock.inTicks} · {clock.lastInKind ?? '—'} · {ageLabel(clock.lastInAt)}
          </div>
          <div className="mono">
            OUT {clock.outTicks} · {clock.lastOutKind ?? '—'} · {ageLabel(clock.lastOutAt)}
          </div>
          <div className="mono">
            forward {clock.forwarding ? 'ON' : 'OFF'}
            {clockRoute ? ` · route ${clockRoute.enabled ? 'enabled' : 'disabled'}` : ' · no clock route'}
          </div>
        </div>
        {clock.forwarding && !clockRoute ? (
          <p className="lead" style={{ marginTop: '0.5rem' }}>
            Forwarding is ON but no clock route — assign Circuit input + MPC/SP output in Settings,
            then toggle forwarding again.
          </p>
        ) : null}
      </div>

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
                  title={
                    snap.routeClockThroughApp
                      ? 'App clock forwarding sets authority to Circuit — prefer Settings toggle'
                      : 'Mark this input as the only allowed clock source'
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
              <div>
                {r.name}
                {r.forwardClock ? <span className="muted mono"> · clk</span> : null}
              </div>
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
