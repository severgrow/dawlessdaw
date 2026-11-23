import { useMemo, useRef, useState } from 'react';
import {
  DEVICE_CATEGORIES,
  MPC_CHANNEL_ISOLATION_HINT,
  MY_STUDIO_ROLES,
  PROFILE_HONESTY_LABEL,
  mpcClockPortAdvice,
  roleUsingPort,
  unmatchedConnectedPorts,
  type DeviceCategory,
  type PortAssignment,
  type StudioRoleDef,
} from '@dawlessdaw/devices';
import { MoreInfo } from '../components/MoreInfo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { formatRouteChannelDetail } from './routeChannelDetail';

const COLOURS = ['#9a2a45', '#9fdcc2', '#e8e1d2', '#4a7c59', '#5b7c99', '#888888'] as const;

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

function UnknownDevicesPanel() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const claimed = useMemo(() => {
    const s = new Set<string>();
    for (const x of snap.assignments) {
      if (x.inputPortId) s.add(x.inputPortId);
      if (x.outputPortId) s.add(x.outputPortId);
    }
    for (const b of Object.values(snap.customBindings)) {
      if (b.inputPortId) s.add(b.inputPortId);
      if (b.outputPortId) s.add(b.outputPortId);
    }
    return s;
  }, [snap.assignments, snap.customBindings]);

  const freeIns = snap.ports.filter((p) => p.type === 'input' && p.state === 'connected' && !claimed.has(p.id));
  const freeOuts = snap.ports.filter((p) => p.type === 'output' && p.state === 'connected' && !claimed.has(p.id));
  const allIns = snap.ports.filter((p) => p.type === 'input' && p.state === 'connected');
  const allOuts = snap.ports.filter((p) => p.type === 'output' && p.state === 'connected');

  const [name, setName] = useState('');
  const [category, setCategory] = useState<DeviceCategory>('other');
  const [colour, setColour] = useState<string>(COLOURS[0]);
  const [channel, setChannel] = useState(1);
  const [inId, setInId] = useState('');
  const [outId, setOutId] = useState('');
  const [controlLabel, setControlLabel] = useState('');

  const save = () => {
    if (!name.trim()) return;
    a.createCustomDevice({
      displayName: name.trim(),
      category,
      colour,
      channel,
      inputPortId: inId || null,
      outputPortId: outId || null,
      honesty: 'generic',
    });
    setName('');
    setInId('');
    setOutId('');
  };

  return (
    <div className="panel">
      <h2>Unknown devices</h2>
      <p className="muted small">
        Name an unmatched port · pick In/Out + channel · remembered on this Mac.
      </p>
      <MoreInfo>
        <p className="muted small">
          Honesty stays <strong>Generic</strong> until you mark a control from a manual (Documented)
          or a live Pass (Verified) — we never invent knobs.
        </p>
      </MoreInfo>

      {(freeIns.length > 0 || freeOuts.length > 0) && (
        <p className="muted small">
          Free ports:{' '}
          {[...freeIns.map((p) => `${p.name} (in)`), ...freeOuts.map((p) => `${p.name} (out)`)].join(' · ') ||
            'none'}
        </p>
      )}

      <div className="custom-device-form">
        <label>
          <span className="ap-label">Name</span>
          <input
            className="text-input"
            value={name}
            placeholder="e.g. Pocket operator"
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          <span className="ap-label">Category</span>
          <select className="select-inline" value={category} onChange={(e) => setCategory(e.target.value as DeviceCategory)}>
            {DEVICE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="ap-label">Colour</span>
          <select className="select-inline" value={colour} onChange={(e) => setColour(e.target.value)}>
            {COLOURS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="ap-label">Channel</span>
          <input
            className="num-input"
            type="number"
            min={1}
            max={16}
            value={channel}
            onChange={(e) => setChannel(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
          />
        </label>
        <label>
          <span className="ap-label">MIDI in</span>
          <select className="select-inline" value={inId} onChange={(e) => setInId(e.target.value)}>
            <option value="">— none yet</option>
            {(freeIns.length ? freeIns : allIns).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="ap-label">MIDI out</span>
          <select className="select-inline" value={outId} onChange={(e) => setOutId(e.target.value)}>
            <option value="">— none yet</option>
            {(freeOuts.length ? freeOuts : allOuts).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!name.trim()} onClick={save}>
          Save device
        </button>
      </div>

      {snap.customProfiles.length === 0 ? (
        <p className="muted small">No custom devices yet. Honesty badge: {PROFILE_HONESTY_LABEL.generic}</p>
      ) : (
        <ul className="custom-device-list">
          {snap.customProfiles.map((p) => {
            const b = snap.customBindings[p.id];
            return (
              <li key={p.id} className="custom-device-card">
                <header>
                  <span className="cd-swatch" style={{ background: p.colour }} aria-hidden />
                  <strong>{p.displayName}</strong>
                  <span className="muted small">{p.category}</span>
                  <span className="honesty-pill" title={PROFILE_HONESTY_LABEL[p.honesty]}>
                    {p.honesty}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="ghost" onClick={() => a.deleteCustomProfile(p.id)}>
                    Remove
                  </button>
                </header>
                <p className="muted small">
                  ch{p.channel}
                  {b?.ambiguous ? ' · ambiguous ports — pick below' : ''}
                  {!b?.inputPortId && !b?.outputPortId ? ' · unplugged / not matched' : ''}
                  {b?.inputPortId || b?.outputPortId
                    ? ` · ${p.inputPortName ?? '—'} in · ${p.outputPortName ?? '—'} out`
                    : ''}
                </p>
                <div className="row">
                  <label>
                    <span className="ap-label">In</span>
                    <select
                      className="select-inline"
                      value={b?.inputPortId ?? ''}
                      onChange={(e) => a.assignCustomProfilePort(p.id, 'input', e.target.value || null)}
                    >
                      <option value="">—</option>
                      {allIns.map((port) => (
                        <option key={port.id} value={port.id}>
                          {port.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="ap-label">Out</span>
                    <select
                      className="select-inline"
                      value={b?.outputPortId ?? ''}
                      onChange={(e) => a.assignCustomProfilePort(p.id, 'output', e.target.value || null)}
                    >
                      <option value="">—</option>
                      {allOuts.map((port) => (
                        <option key={port.id} value={port.id}>
                          {port.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="cd-controls">
                  {p.controls.length === 0 ? (
                    <p className="muted small">No controls yet — Generic MIDI only.</p>
                  ) : null}
                  {p.controls.map((c) => {
                    const learning =
                      snap.genericLearn?.profileId === p.id && snap.genericLearn.controlId === c.id;
                    return (
                      <div key={c.id} className="row cd-ctrl">
                        <span>
                          {c.label}
                          {c.cc != null ? (
                            <span className="mono small"> · CC {c.cc}{c.channel != null ? ` ch${c.channel}` : ''}</span>
                          ) : (
                            <span className="muted small"> · not learned</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={learning ? 'active' : 'ghost'}
                          onClick={() => (learning ? a.cancelGenericLearn() : a.startGenericLearn(p.id, c.id))}
                        >
                          {learning ? 'Listening… Cancel' : 'MIDI Learn'}
                        </button>
                        <button type="button" className="ghost" onClick={() => a.removeCustomControl(p.id, c.id)}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <div className="row">
                    <input
                      className="text-input"
                      placeholder="New control name"
                      value={controlLabel}
                      onChange={(e) => setControlLabel(e.target.value)}
                      maxLength={80}
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!controlLabel.trim()}
                      onClick={() => {
                        a.addCustomControl(p.id, controlLabel);
                        setControlLabel('');
                      }}
                    >
                      Add control
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const json = a.exportCustomProfilesJson();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'dawlessdaw-device-profiles.json';
            link.click();
            URL.revokeObjectURL(url);
          }}
          disabled={!snap.customProfiles.length}
        >
          Export profiles JSON
        </button>
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          Import profiles JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const text = await file.text();
            a.importCustomProfilesJson(text);
          }}
        />
      </div>
      <MoreInfo>
        <p className="muted small">Import validates schema only — local file, no cloud.</p>
      </MoreInfo>
    </div>
  );
}

export function SetupWorkspace({
  onReopenWizard,
  experimental = false,
  setExperimental,
}: {
  onReopenWizard?: () => void;
  experimental?: boolean;
  setExperimental?: (on: boolean) => void;
} = {}) {
  const snap = useStudioStore();
  const {
    rescanMidiPorts,
    setFm1Firmware,
    setMpcNoteMode,
    setClockToMpc,
    applyMyStudioRoutes,
    enableRoute,
  } = useStudioActions();
  const customClaimed = Object.values(snap.customBindings).flatMap((b) =>
    [b.inputPortId, b.outputPortId].filter((id): id is string => Boolean(id)),
  );
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments, customClaimed);
  const connected = snap.ports.filter((p) => p.state === 'connected');
  const mpc = snap.assignments.find((a) => a.roleId === 'mpc');
  const clock = snap.clockActivity;
  const clockAdvice = mpcClockPortAdvice(mpc?.outputPortName ?? null);

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>ports &amp; devices</h1>
        <button type="button" onClick={() => void rescanMidiPorts()}>
          Rescan ports
        </button>
      </div>
      <p className="lead">
        Tell Splot which USB port is which. Status is in the top strip — reopen the connect guide anytime.
      </p>
      <div className="row" style={{ marginBottom: '0.85rem' }}>
        {onReopenWizard ? (
          <button type="button" onClick={onReopenWizard}>
            Connect your rig…
          </button>
        ) : null}
        {setExperimental ? (
          <label className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={experimental}
              onChange={(e) => setExperimental(e.target.checked)}
            />
            <span className="small">Show experimental tools (Deep Sync, SP USB)</span>
          </label>
        ) : null}
      </div>
      {!experimental ? (
        <p className="muted small">
          Bench tests: open the <b>Tests</b> sub-tab. Deep Sync stays behind the experimental toggle.
        </p>
      ) : (
        <p className="callout seq-honesty">
          Experimental on — Circuit Deep Sync (Test tab) and SP USB tools may stop playback or change
          device state; use carefully.
        </p>
      )}

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
            {' — '}add as an unknown device below, or assign above.
          </p>
        ) : null}
        <p className="muted small">ZED-10FX = USB audio only (no MIDI). Missing device → cable / Audio MIDI Setup.</p>
      </div>

      <UnknownDevicesPanel />

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
            ? `Notes via MPC Out = ${mpc?.outputPortName ?? 'not assigned'}${mpc?.outputManual && !mpc.outputPortId ? ' (unplugged)' : ''}. Circuit T1–T4 → ch9–12 on that one port (per channel — the app does not fan out).`
            : 'App sends MPC nothing — thru-box mode (MPC T1–4 on ch 1–4).'}
        </p>
        {snap.mpcNoteMode === 'usb' ? (
          <MoreInfo label="Tracks sound mixed / wrong program?">
            <p className="muted small">{MPC_CHANNEL_ISOLATION_HINT}</p>
            <ol className="steps">
              <li>
                <b>Each MPC track 1–4</b> — MIDI input port = MIDI In (or the Scarlett path), channel{' '}
                <b>9 / 10 / 11 / 12</b> — not All.
              </li>
              <li>
                <b>Monitoring = In</b> on those tracks — not Auto (Auto only plays the selected track, so
                Circuit T1 drums can trigger whatever program is selected on track 3).
              </li>
              <li>
                <b>USB vs DIN</b> — notes work on either; sequencer clock needs Scarlett→DIN (see below).
              </li>
              <li>
                Changing a program on the MPC UI only affects that track. If every track changes, they are
                still on All (or hearing Section Bridge PC on ch15 as All).
              </li>
            </ol>
          </MoreInfo>
        ) : null}
      </div>

      <div className="panel">
        <h2>MPC follows Circuit Play</h2>
        <p className="muted small">
          Sequencer sync via clock → <strong>MPC Out</strong> (Scarlett→DIN; USB-B ignores clock).
        </p>
        <div className="switch-row">
          <button
            type="button"
            className={snap.clockToMpc ? 'active' : ''}
            onClick={() => setClockToMpc(!snap.clockToMpc)}
            disabled={snap.mpcNoteMode === 'din-only'}
          >
            {snap.clockToMpc ? 'On — transport → MPC' : 'Off'}
          </button>
        </div>
        {snap.mpcNoteMode === 'din-only' ? (
          <p className="warn">Switch to &quot;App sends notes&quot; first — thru-box mode blocks transport.</p>
        ) : null}
        <p className={clockAdvice.kind === 'warn-akai-usb' ? 'warn' : 'muted small'}>
          {clockAdvice.message}
        </p>
        <MoreInfo label="Checklist">
          <p className="muted small">
            Ports › MPC Out = Scarlett (not &quot;MPC One&quot;). Notes + transport share that port on
            separate routes.
          </p>
          <ol className="steps">
            <li>
              <b>Cable</b> Scarlett MIDI Out → MPC MIDI In.
            </li>
            <li>
              <b>Ports</b> — MPC Out = Scarlett.
            </li>
            <li>
              <b>This switch On</b> — Circuit Clock Tx (pad 32) bright.
            </li>
            <li>
              <b>MPC</b> MIDI In on · Receive = MIDI Clock · send clock off.
            </li>
            <li>
              Circuit <b>Play</b> starts / stops the MPC sequence.
            </li>
          </ol>
          <p className="muted small">Bench g3 Pass = verified on your firmware. Clock + Start only — no MMC.</p>
        </MoreInfo>
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
            ? 'Skiff: macros + Level/Pan on routed tracks. Keep FM1 off the thru box.'
            : 'h1: notes only · all channels — never on the thru box.'}
        </p>
        {snap.fm1Firmware === 'skiff' ? (
          <MoreInfo>
            <p className="muted small">
              Macros 1–7 → sound settings, 8 → steps. Mixer CC29/30 → Skiff LEVEL/PAN. FM1 MENU › MIDI ›
              T1–T4 CHANNEL = 5, 6, 7, 8.
            </p>
          </MoreInfo>
        ) : null}
      </div>

      <details className="panel diag">
        <summary>
          <h2>Troubleshooting</h2>
        </summary>

        <h3>Every port Chrome sees ({connected.length})</h3>
        {connected.length === 0 ? (
          <p className="muted mono">
            No ports listed. Check USB, Audio MIDI Setup, and that Chrome allowed MIDI — then Rescan.
          </p>
        ) : (
          <ul className="cap-list mono small">
            {connected.map((p) => {
              const role = roleUsingPort(snap.assignments, p.id);
              const custom = Object.entries(snap.customBindings).find(
                ([, b]) => b.inputPortId === p.id || b.outputPortId === p.id,
              );
              const customName = custom
                ? snap.customProfiles.find((x) => x.id === custom[0])?.displayName
                : null;
              const label = role
                ? (MY_STUDIO_ROLES.find((r) => r.id === role)?.label ?? role)
                : customName
                  ? `custom: ${customName}`
                  : 'not assigned';
              return (
                <li key={`${p.type}-${p.id}`}>
                  [{p.type === 'input' ? 'in' : 'out'}] {p.name}
                  {p.manufacturer ? ` · ${p.manufacturer}` : ''} →{' '}
                  <span className={role || customName ? '' : 'warn'}>{label}</span>
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
