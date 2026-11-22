import { useStudioActions, useStudioStore } from '../store/useStudioStore';

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
        {snap.ports.map((p) => (
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
        ))}
      </div>

      <div className="panel">
        <h2>Routes</h2>
        {snap.routes.map((r) => (
          <div key={r.id} className="route-row">
            <div>
              <div>{r.name}</div>
              <div className="path">
                {r.sourcePortId} → {r.destinations.map((d) => d.portId).join(' + ')}
                {r.channel?.allow ? ` · ch ${r.channel.allow.join(',')}` : ''}
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
