import {
  MY_STUDIO_ROLES,
  roleUsingPort,
  unmatchedConnectedPorts,
  type PortAssignment,
  type StudioRoleDef,
} from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { formatRouteChannelDetail } from './routeChannelDetail';

function PortSelect({
  role,
  which,
  a,
}: {
  role: StudioRoleDef;
  which: 'input' | 'output';
  a: PortAssignment | undefined;
}) {
  const snap = useStudioStore();
  const { assignStudioPort } = useStudioActions();
  const ports = snap.ports.filter((p) => p.type === which && p.state === 'connected');
  const id = which === 'input' ? a?.inputPortId : a?.outputPortId;
  const manual = which === 'input' ? a?.inputManual : a?.outputManual;
  const name = which === 'input' ? a?.inputPortName : a?.outputPortName;
  return (
    <select
      className="select-inline port-select"
      aria-label={`${role.label} ${which === 'input' ? 'in' : 'out'}`}
      value={id ?? (manual ? '__remembered__' : '')}
      onChange={(e) => assignStudioPort(role.id, which, e.target.value || null)}
    >
      <option value="">— auto</option>
      {manual && !id ? (
        <option value="__remembered__" disabled>
          {name ?? 'remembered port'} (unplugged)
        </option>
      ) : null}
      {ports.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function SetupWorkspace() {
  const snap = useStudioStore();
  const { rescanMidiPorts, setFm1Firmware, setMpcNoteMode, applyMyStudioRoutes, enableRoute } =
    useStudioActions();
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments);
  const connected = snap.ports.filter((p) => p.state === 'connected');
  const mpc = snap.assignments.find((a) => a.roleId === 'mpc');
  const clock = snap.clockActivity;

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>setup</h1>
        <button type="button" onClick={() => void rescanMidiPorts()}>
          Rescan ports
        </button>
      </div>
      <p className="lead">
        Which port is which device. Most are found automatically; pick by hand when a name isn&apos;t
        recognised (e.g. the Scarlett for the MPC). Hand-picked ports are remembered by name, even
        while unplugged. Choose <strong>— auto</strong> to go back to automatic.
      </p>
      {snap.midiError ? <p className="callout warn-callout">{snap.midiError}</p> : null}

      <div className="panel">
        <h2>Ports</h2>
        <div className="ports-table" role="table" aria-label="Device ports">
          <div className="pt-row pt-head" role="row">
            <span role="columnheader">Device</span>
            <span role="columnheader">MIDI in (to the app)</span>
            <span role="columnheader">MIDI out (from the app)</span>
          </div>
          {MY_STUDIO_ROLES.filter((r) => r.midi).map((role) => {
            const a = snap.assignments.find((x) => x.roleId === role.id);
            return (
              <div key={role.id} className="pt-row" role="row">
                <span role="rowheader" className="pt-device">
                  <span className={`indicator ${a?.connected ? 'on' : ''}`} />
                  <strong>{role.label}</strong>
                  {a?.inputManual || a?.outputManual ? <span className="muted mono small">by hand</span> : null}
                </span>
                <span role="cell">
                  <PortSelect role={role} which="input" a={a} />
                </span>
                <span role="cell">
                  <PortSelect role={role} which="output" a={a} />
                </span>
              </div>
            );
          })}
        </div>
        {unmatched.length > 0 ? (
          <p className="muted small">
            Not assigned: {unmatched.map((p) => `${p.name} (${p.type === 'input' ? 'in' : 'out'})`).join(' · ')}
          </p>
        ) : null}
        <p className="muted small">
          Allen &amp; Heath ZED-10FX: USB audio only — the app can&apos;t see it over MIDI. A device
          missing from every list isn&apos;t visible to the Mac: check its cable and Audio MIDI Setup.
        </p>
      </div>

      <div className="panel">
        <h2>MPC connection</h2>
        <div className="row">
          <button
            type="button"
            className={snap.mpcNoteMode === 'usb' ? 'active' : ''}
            onClick={() => setMpcNoteMode('usb')}
          >
            App sends notes (USB or Scarlett)
          </button>
          <button
            type="button"
            className={snap.mpcNoteMode === 'din-only' ? 'active' : ''}
            onClick={() => setMpcNoteMode('din-only')}
          >
            MIDI cable from thru box only
          </button>
        </div>
        <p className="muted small">
          {snap.mpcNoteMode === 'usb'
            ? `The app sends the MPC its tracks (Rig tab) and clock through MPC Out = ${mpc?.outputPortName ?? 'not assigned'}${mpc?.outputManual && !mpc.outputPortId ? ' (unplugged)' : ''}. Via the Scarlett this is a DIN cable, so the MPC accepts clock.`
            : 'The app sends the MPC nothing (notes or clock). Use only if the MPC is back on the thru box, with MPC tracks 1–4 on channels 1–4.'}
        </p>
      </div>

      <div className="panel">
        <h2>FM1 firmware</h2>
        <div className="row">
          <button type="button" className={snap.fm1Firmware === 'skiff' ? 'active' : ''} onClick={() => setFm1Firmware('skiff')}>
            Skiff
          </button>
          <button type="button" className={snap.fm1Firmware === 'h1' ? 'active' : ''} onClick={() => setFm1Firmware('h1')}>
            h1
          </button>
        </div>
        <p className="muted small">
          {snap.fm1Firmware === 'skiff'
            ? 'Skiff: tracks sent to the FM1 also carry the macro knobs (1–7 → sound settings, 8 → steps sounds) and Circuit Mixer Level/Pan (CC29/30 → Skiff LEVEL/PAN). On the FM1: MENU › MIDI › T1–T4 CHANNEL = 5, 6, 7, 8. Keep the FM1 off the thru box.'
            : 'h1: notes only, and h1 plays every channel — never put it on the thru box.'}
        </p>
      </div>

      <details className="panel diag">
        <summary>
          <h2>Troubleshooting</h2>
        </summary>

        <h3>Every port Chrome sees ({connected.length})</h3>
        {connected.length === 0 ? (
          <p className="muted mono">No ports. Check USB, Audio MIDI Setup, and that Chrome allowed MIDI.</p>
        ) : (
          <ul className="cap-list mono small">
            {connected.map((p) => {
              const role = roleUsingPort(snap.assignments, p.id);
              const label = role ? (MY_STUDIO_ROLES.find((r) => r.id === role)?.label ?? role) : 'not assigned';
              return (
                <li key={`${p.type}-${p.id}`}>
                  [{p.type === 'input' ? 'in' : 'out'}] {p.name}
                  {p.manufacturer ? ` · ${p.manufacturer}` : ''} → <span className={role ? '' : 'warn'}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Clock monitor</h3>
        <p className="mono small">
          IN {clock.inTicks} (start {clock.inStart} · stop {clock.inStop}) · OUT {clock.outTicks} (start{' '}
          {clock.outStart} · stop {clock.outStop}) · forwarding {clock.forwarding ? 'on' : 'off'}
        </p>
        <p className="muted small">{clock.hint}</p>

        <h3>Active routes ({snap.routes.length})</h3>
        <div className="row" style={{ marginBottom: '0.5rem' }}>
          <button type="button" className="ghost" onClick={() => applyMyStudioRoutes()}>
            Rebuild routes
          </button>
        </div>
        {snap.routes.map((r) => (
          <div key={r.id} className="route-row">
            <div>
              <div>{r.name}</div>
              <div className="path">
                {r.destinations.length} out{formatRouteChannelDetail(r.channel)}
                {r.note?.transpose ? ` · transpose ${r.note.transpose}` : ''}
              </div>
            </div>
            <button type="button" className={r.enabled ? 'active' : ''} onClick={() => enableRoute(r.id, !r.enabled)}>
              {r.enabled ? 'on' : 'off'}
            </button>
          </div>
        ))}

        <h3>Recent events</h3>
        <ul className="event-log">
          {snap.recentUiEvents.slice(0, 20).map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="muted">{new Date(e.at).toLocaleTimeString()}</span> {e.summary}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
