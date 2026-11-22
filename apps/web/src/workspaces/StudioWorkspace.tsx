import { SceneSessionSelectors } from '../components/SceneSessionSelectors';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StudioWorkspace() {
  const snap = useStudioStore();
  const { setFocusMode, pinDevice } = useStudioActions();

  return (
    <div className="section-enter">
      <h1>Studio</h1>
      <p className="lead">
        Hardware-first patch surface. Everything here is your real gear over Web MIDI in Chrome —
        a device that isn't plugged in shows as missing.
      </p>
      <SceneSessionSelectors />

      <div className="panel">
        <h2>Focus engine</h2>
        <div className="row">
          {(['follow', 'smart', 'manual'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={snap.focus.mode === mode ? 'active' : ''}
              onClick={() => setFocusMode(mode)}
            >
              {mode}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              pinDevice(snap.focus.pinnedDeviceId ? null : snap.focus.activeDeviceId)
            }
            disabled={!snap.focus.activeDeviceId}
          >
            {snap.focus.pinnedDeviceId ? 'Unpin' : 'Pin'}
          </button>
        </div>
        <p className="muted mono" style={{ marginTop: '0.65rem' }}>
          active={snap.focus.activeDeviceId ?? 'none'} · soft=
          {snap.focus.softFocus?.deviceId ?? 'none'}
        </p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Routing overview</h2>
          {snap.routes.length === 0 ? (
            <p className="muted">No routes</p>
          ) : (
            snap.routes.map((r) => (
              <div key={r.id} className="route-row">
                <div>
                  <div>
                    {r.enabled ? '●' : '○'} {r.name}
                  </div>
                  <div className="path">
                    {r.sourcePortId} → {r.destinations.map((d) => d.portId).join(', ')}
                  </div>
                </div>
                <span className="muted mono">{r.forwardClock ? 'clk' : 'notes'}</span>
              </div>
            ))
          )}
          <p className="muted mono">
            Clock authority: {snap.clockAuthorityPortId ?? 'none'}
          </p>
        </div>

        <div className="panel">
          <h2>Last Circuit gesture</h2>
          {snap.lastCircuitGesture ? (
            <p className="mono">
              {snap.lastCircuitGesture.gesture} — {snap.lastCircuitGesture.summary}
            </p>
          ) : (
            <p className="muted">Nothing yet. Play or change a Project on the Circuit.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Roles (Circuit → destinations)</h2>
        {snap.roles.map((role) => (
          <div key={role.roleId} className="list-row">
            <div>
              <strong>{role.label}</strong>
              <div className="path">
                {role.role} · ch{role.sourceChannel ?? '—'} →{' '}
                {role.destinationPortIds.join(', ') || 'unpatched'}
              </div>
            </div>
          </div>
        ))}
        <p className="muted">
          Arranger: {snap.arranger.label} · hardware Scene Sync:{' '}
          {String(snap.arranger.hardwareSceneSync)}
        </p>
      </div>
    </div>
  );
}
