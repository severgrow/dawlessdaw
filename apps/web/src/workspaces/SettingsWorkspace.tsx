import {
  MY_STUDIO_ROLES,
  roleUsingPort,
  unmatchedConnectedPorts,
} from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

function portOptionLabel(p: {
  name: string;
  manufacturer?: string;
  state: string;
  id: string;
}): string {
  const mfr = p.manufacturer ? ` · ${p.manufacturer}` : '';
  const state = p.state !== 'connected' ? ` [${p.state}]` : '';
  return `${p.name}${mfr}${state}`;
}

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
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments);
  const allConnected = snap.ports.filter((p) => p.state === 'connected');

  return (
    <div className="section-enter">
      <h1>Settings</h1>
      <p className="lead">
        Live port matching for your studio. Clock stays on the hardware thru box by default;
        enable app clock forwarding only for USB-only sync (no DIN thru).
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
        <h2>My Studio channel plan</h2>
        <p className="lead">
          Thru box sends all Circuit MIDI (notes + ch16 PGM + clock) into MPC and SP. USB routes
          remap so notes are not doubled:
        </p>
        <ul className="cap-list mono" style={{ fontSize: 12 }}>
          <li>Circuit ch1–4 → MPC ch9–12</li>
          <li>Circuit ch5 → FM1 ch5 (USB only; H-1 = generic MIDI until bench)</li>
          <li>Circuit ch6 → SP-404 ch13</li>
          <li>Mute Learn: CC 20 on MPC control ch15 (not 16)</li>
          <li>Section Bridge: SP PC ch13 · MPC PC ch15 · never 1–8 or 16</li>
        </ul>
      </div>

      <div className="panel">
        <h2>MIDI clock through app</h2>
        <p className="lead">
          Default <strong>OFF</strong> — clock stays on hardware (Circuit MIDI Out → thru → MPC +
          SP). Turn <strong>ON</strong> only to forward Circuit clock / start / stop over USB to
          MPC + SP. Circuit Setup <strong>Clock Tx</strong> (pad 32) must be bright. Watch Patchbay
          F8/FA counters. <strong>Akai MPC USB-B typically does not accept MIDI Clock from a
          computer</strong> — if OUT ticks but MPC is silent, use DIN thru and leave this OFF. If
          you add DIN thru later, turn this OFF to avoid double clock.
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
        <h2>All Web MIDI ports (raw)</h2>
        <p className="lead">
          Same inventory as Patchbay Ports: every input/output Chrome reports. FM1 often appears as
          Felucca (auto-matched). If the strip says unassigned / no Web MIDI port but a name is
          here, assign it below. If MPC is missing here entirely, fix USB / Audio MIDI Setup first.
        </p>
        {allConnected.length === 0 ? (
          <p className="muted mono">
            No connected ports. If Live MIDI is on, check USB, Audio MIDI Setup, and restart
            Chrome.
          </p>
        ) : (
          <ul className="cap-list mono" style={{ fontSize: 12 }}>
            {allConnected.map((p) => {
              const role = roleUsingPort(snap.assignments, p.id);
              const roleLabel = role
                ? MY_STUDIO_ROLES.find((r) => r.id === role)?.label ?? role
                : 'UNMATCHED';
              return (
                <li key={`${p.type}-${p.id}`}>
                  [{p.type}] {p.name}
                  {p.manufacturer ? ` · mfr:${p.manufacturer}` : ''}
                  {' → '}
                  <span className={role ? '' : 'warn'}>{roleLabel}</span>
                </li>
              );
            })}
          </ul>
        )}
        {unmatched.length > 0 && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            {unmatched.length} connected port{unmatched.length === 1 ? '' : 's'} unmatched — use the
            dropdowns below to assign MPC / FM1 if those names belong to them.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Port assignments (saved on this Mac)</h2>
        <p className="muted">
          Wrong or missing match? Pick the correct port manually (dropdown lists every raw name).
          Survives reload.
        </p>
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
                        {portOptionLabel(p)}
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
                        {portOptionLabel(p)}
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
