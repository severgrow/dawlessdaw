import { MY_STUDIO_ROLES } from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function SettingsWorkspace() {
  const snap = useStudioStore();
  const {
    setSimulation,
    setRouteClockThroughApp,
    assignStudioPort,
    applyMyStudioRoutes,
    getAssistantTools,
    getRuntime,
  } = useStudioActions();
  const tools = getAssistantTools();
  const native = getRuntime().getNativeBridgeStub();
  const inputs = snap.ports.filter((p) => p.type === 'input');
  const outputs = snap.ports.filter((p) => p.type === 'output');

  return (
    <div className="section-enter">
      <h1>Settings</h1>
      <p className="lead">
        Live port matching for your studio. Clock stays on the hardware thru box unless you
        deliberately enable app clock forwarding.
      </p>

      <div className="panel">
        <h2>Transport</h2>
        <p className="mono">
          Active: {snap.transportKind} · simulation={String(snap.simulation)}
        </p>
        <div className="row">
          <button type="button" onClick={() => void setSimulation(true)}>
            MockMidiTransport
          </button>
          <button type="button" onClick={() => void setSimulation(false)}>
            WebMidiTransport (Live)
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          NativeBridgeTransport available={String(native.isAvailable())} (stub)
        </p>
      </div>

      <div className="panel">
        <h2>MIDI clock through app</h2>
        <p className="lead">
          Your setup: Circuit MIDI Out → thru box → MPC + SP. Leave this OFF.
        </p>
        <button
          type="button"
          className={snap.routeClockThroughApp ? 'active' : ''}
          onClick={() => setRouteClockThroughApp(!snap.routeClockThroughApp)}
        >
          App clock forwarding: {snap.routeClockThroughApp ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="panel">
        <h2>Port assignments (saved on this Mac)</h2>
        <p className="muted">Wrong match? Pick the correct port manually. Survives reload.</p>
        {MY_STUDIO_ROLES.filter((r) => r.midi).map((role) => {
          const a = snap.assignments.find((x) => x.roleId === role.id);
          return (
            <div key={role.id} className="list-row" style={{ gridTemplateColumns: '1fr' }}>
              <strong>
                {role.label}{' '}
                <span className="muted mono">
                  {a?.connected ? 'connected' : 'not connected'}
                </span>
              </strong>
              <div className="row" style={{ marginTop: 4 }}>
                <label className="mono">
                  In{' '}
                  <select
                    className="select-inline"
                    value={a?.inputPortId ?? ''}
                    onChange={(e) =>
                      assignStudioPort(role.id, 'input', e.target.value || null)
                    }
                  >
                    <option value="">—</option>
                    {inputs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mono">
                  Out{' '}
                  <select
                    className="select-inline"
                    value={a?.outputPortId ?? ''}
                    onChange={(e) =>
                      assignStudioPort(role.id, 'output', e.target.value || null)
                    }
                  >
                    <option value="">—</option>
                    {outputs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
        <button type="button" style={{ marginTop: '0.75rem' }} onClick={() => applyMyStudioRoutes()}>
          Re-apply My Studio routes
        </button>
      </div>

      <div className="panel">
        <h2>AssistantTool registry</h2>
        <p className="lead">Extension point only — no AI in the MIDI path.</p>
        <ul className="cap-list">
          {tools.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong>
              <div className="muted">{t.description}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
