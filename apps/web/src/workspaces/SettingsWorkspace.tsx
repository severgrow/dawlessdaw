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
    rescanMidiPorts,
    setRouteClockThroughApp,
    setFm1Firmware,
    setMpcNoteMode,
    setForwardClockToFm1,
    setCircuitT1to4Target,
    setSpNoteOffset,
    learnSpPadOffset,
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
          Active: {snap.transportKind} · {snap.midiReady ? 'MIDI ready' : 'no MIDI access'}
        </p>
        {snap.midiError ? <p className="warn">{snap.midiError}</p> : null}
        <div className="row">
          <button type="button" onClick={() => void rescanMidiPorts()}>
            Rescan MIDI ports
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          NativeBridgeTransport available={String(native.isAvailable())} (stub). Rescan re-requests
          Web MIDI; if Audio MIDI Setup has no MPC, the app still cannot show it.
        </p>
      </div>

      <div className="panel">
        <h2>My Studio channel plan</h2>
        <p className="lead">
          FM1 jam: Circuit T5–T8 → FM1 over USB (Chrome often calls it Felucca). The thru box still
          mirrors all Circuit MIDI into MPC/SP over the cable, so app routes use channels the cable
          path never plays:
        </p>
        <ul className="cap-list mono" style={{ fontSize: 12 }}>
          <li>
            {snap.circuitT1to4Target === 'sp'
              ? 'Circuit ch1–4 → SP banks A–D over USB (SP MIDI Mode A, pads = notes 36–51)'
              : snap.mpcNoteMode === 'din-only'
                ? 'MPC: MIDI cable only — MPC tracks 1–4 listen to the DIN port on ch1–4; app sends nothing'
                : 'Circuit ch1–4 → MPC ch9–12 over USB (no-op if MPC absent)'}
            {snap.circuitT1to4Target === 'both' ? ' · and → SP banks A–D' : ''}
          </li>
          <li>
            {snap.fm1Firmware === 'skiff'
              ? 'Circuit ch5–8 → FM1 ch5–8 (Skiff T1–T4) · macro knobs CC21–28 → Skiff CCs; other CCs dropped'
              : 'Circuit ch5–6 → FM1 (h1) · notes only'}
          </li>
          <li>Keep the FM1 off the thru box — it gets only what the app sends it</li>
          <li>Mute Learn: CC 20 on MPC control ch15 (not 16)</li>
          <li>Section Bridge: SP PC ch13 · MPC PC ch15 · never 1–8 or 16</li>
        </ul>
      </div>

      <div className="panel">
        <h2>FM1 firmware</h2>
        <p className="lead">
          <strong>Skiff</strong>: Circuit tracks 5–8 → FM1 on channels 5–8 over USB. On the FM1 set
          Skiff MENU › MIDI › T1–T4 CHANNEL to 5, 6, 7, 8. Circuit macro knobs 1–8 become Skiff
          brightness, resonance, attack, decay, release, delay, reverb, level. Load empty samples on
          Circuit tracks 5–8. <strong>h1</strong>: tracks 5–6, notes only (h1 plays every
          channel — keep it off the thru box).
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={snap.fm1Firmware === 'skiff' ? 'active' : ''}
            onClick={() => setFm1Firmware('skiff')}
          >
            Skiff
          </button>
          <button
            type="button"
            className={snap.fm1Firmware === 'h1' ? 'active' : ''}
            onClick={() => setFm1Firmware('h1')}
          >
            h1
          </button>
        </div>
        <button
          type="button"
          style={{ marginTop: '0.5rem' }}
          className={snap.forwardClockToFm1 ? 'active' : ''}
          onClick={() => setForwardClockToFm1(!snap.forwardClockToFm1)}
        >
          Circuit clock → FM1 over USB: {snap.forwardClockToFm1 ? 'ON' : 'OFF'}
        </button>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Turn ON with Skiff CLOCK = USB so the FM1 follows the Circuit&apos;s tempo and play/stop.
        </p>
      </div>

      <div className="panel">
        <h2>Circuit tracks 1–4</h2>
        <p className="lead">
          <strong>SP banks A–D</strong>: track 1 plays bank A, track 2 bank B, track 3 bank C,
          track 4 bank D. On the SP: MIDI settings → <strong>MIDI Mode A</strong> (bank A–J = MIDI
          channels 1–10, pads 1–16 = notes 36–51). Knob and Program Change messages are not sent to
          the SP. In Mode A, Section Bridge pattern changes on ch13 will not work.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(
            [
              ['mpc', 'MPC'],
              ['sp', 'SP banks A–D'],
              ['both', 'Both'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={snap.circuitT1to4Target === id ? 'active' : ''}
              onClick={() => setCircuitT1to4Target(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {snap.circuitT1to4Target !== 'mpc' ? (
          <>
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Which Circuit note hits SP pad 1? Press <strong>Learn pad 1</strong>, then play that
              note on Circuit track 1–4 (Live mode). The next 15 notes up play pads 2–16.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className={snap.learningSpPadOffset ? 'active' : ''}
                onClick={() => learnSpPadOffset()}
              >
                {snap.learningSpPadOffset ? 'Listening… play a note' : 'Learn pad 1'}
              </button>
              <button type="button" onClick={() => setSpNoteOffset(snap.spNoteOffset - 1)}>
                −1
              </button>
              <span className="mono">
                offset {snap.spNoteOffset >= 0 ? '+' : ''}
                {snap.spNoteOffset} · Circuit note {36 - snap.spNoteOffset} = pad 1
              </span>
              <button type="button" onClick={() => setSpNoteOffset(snap.spNoteOffset + 1)}>
                +1
              </button>
            </div>
            {snap.spNoteOffset === 0 ? (
              <p className="warn" style={{ marginTop: '0.5rem' }}>
                Offset 0 means the Circuit already sends SP pad notes, so the thru-box cable plays
                the SP by itself. Choose <strong>MPC</strong> here to avoid every note playing twice.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="panel">
        <h2>MPC connection</h2>
        <p className="lead">
          <strong>USB</strong>: app sends Circuit tracks 1–4 to the MPC on channels 9–12.{' '}
          <strong>MIDI cable only</strong>: the app sends the MPC nothing; set MPC tracks 1–4 to
          listen to the MIDI (DIN) port on channels 1–4 — they hear the Circuit through the thru box.
          Use this when the Mac can&apos;t see the MPC over USB.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={snap.mpcNoteMode === 'usb' ? 'active' : ''}
            onClick={() => setMpcNoteMode('usb')}
          >
            USB
          </button>
          <button
            type="button"
            className={snap.mpcNoteMode === 'din-only' ? 'active' : ''}
            onClick={() => setMpcNoteMode('din-only')}
          >
            MIDI cable only
          </button>
        </div>
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
        {snap.routeClockThroughApp ? (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Forwarding is ON. For FM1-only note routing this does not matter much — turn OFF unless
            you are intentionally sending USB clock to MPC/SP (and prefer DIN thru for MPC).
          </p>
        ) : null}
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
