import { SceneSessionSelectors } from '../components/SceneSessionSelectors';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function StudioWorkspace() {
  const snap = useStudioStore();
  const { setFocusMode, pinDevice, playFixture, playProjectChangeFixture, injectNote } =
    useStudioActions();
  const focusDevice = snap.devices.find((d) => d.id === snap.focus.activeDeviceId);

  return (
    <div className="section-enter">
      <h1>Studio</h1>
      <p className="lead">
        Hardware-first patch surface. Simulation uses mock ports; live mode requests Web MIDI in
        Chrome.
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
          <h2>Simulation</h2>
          {!snap.simulation ? (
            <p className="lead">Live mode — fixtures disabled.</p>
          ) : (
            <>
              <div className="row">
                <button type="button" onClick={() => playFixture()}>
                  Replay groove fixture
                </button>
                <button type="button" onClick={() => playProjectChangeFixture()}>
                  Simulate Project PGM
                </button>
                {focusDevice?.inputPortIds[0] ? (
                  <button
                    type="button"
                    onClick={() => injectNote(focusDevice.inputPortIds[0]!, 60)}
                  >
                    Inject note on focus
                  </button>
                ) : null}
              </div>
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Groove fixture = clock + notes. Project PGM fixture maps Circuit Project→Dawlessdaw
                Scene in sim only — not a hardware proof.
              </p>
              {snap.lastCircuitGesture ? (
                <p className="mono muted">
                  Circuit gesture: {snap.lastCircuitGesture.gesture} —{' '}
                  {snap.lastCircuitGesture.summary}
                </p>
              ) : null}
            </>
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
