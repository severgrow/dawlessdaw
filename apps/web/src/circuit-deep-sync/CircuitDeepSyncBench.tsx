import { useEffect, useState, useSyncExternalStore } from 'react';
import { CIRCUIT_DEEP_SYNC_CAPABILITIES } from '@dawlessdaw/devices';
import { deepSyncController } from './deepSyncController';

function useDeepSync() {
  return useSyncExternalStore(
    (cb) => deepSyncController.subscribe(cb),
    () => deepSyncController.getSnapshot(),
    () => deepSyncController.getSnapshot(),
  );
}

export function CircuitDeepSyncBench() {
  const snap = useDeepSync();
  const [open, setOpen] = useState(false);
  const [pack, setPack] = useState(0);
  const [sessIndex, setSessIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewTrack, setViewTrack] = useState(0);

  useEffect(() => () => {
    // Leave session closed on unmount if user navigates away while enabled —
    // do not auto-disable (user may want logs). File session is closed after each read.
  }, []);

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onEnableToggle(): Promise<void> {
    if (snap.enabled) {
      await run('Disable', () => deepSyncController.disable());
      return;
    }
    const ok = window.confirm(
      'Enable Circuit Deep Sync?\n\n' +
        'This opens a SEPARATE Web MIDI session with SysEx (not production routing).\n' +
        'Safe probes: identity, custom-FW marker, passive monitor, local .ncs parse.\n' +
        'Device file-session reads STOP PLAYBACK and lock the panel — confirmed separately.\n' +
        'Never firmware update / storage writes / destructive SysEx.',
    );
    if (!ok) return;
    await run('Enable', () => deepSyncController.enable());
  }

  async function onDeviceRead(): Promise<void> {
    const ok = window.confirm(
      'Read a SAVED session from the Circuit via stock file protocol?\n\n' +
        '• This STOPS PLAYBACK and locks the panel until the session closes (Remix behaviour).\n' +
        '• Returns saved project storage — NOT unsaved live sequencer RAM.\n' +
        '• Close Components / other SysEx apps first.\n' +
        '• Save your project on the device first if you care about unsaved edits.\n\n' +
        'Continue?',
    );
    if (!ok) return;
    await run('Device session read', () =>
      deepSyncController.readSavedSessionFromDevice({
        confirmedStopPlayback: true,
        pack,
        index: sessIndex,
      }),
    );
  }

  function onLocalFile(file: File | null): void {
    if (!file) return;
    void file.arrayBuffer().then((buf) => {
      try {
        deepSyncController.loadLocalNcs(new Uint8Array(buf), file.name);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const patterns =
    snap.session?.patterns.filter((p) => p.track === viewTrack && !p.empty) ?? [];

  return (
    <section className="bench-group circuit-deep-sync">
      <h2 className="group-title">
        Circuit Deep Sync
        <span className="muted mono"> research · isolated</span>
      </h2>
      <p className="lead">
        Read-only investigation of whether stock Circuit Rhythm USB MIDI can expose{' '}
        <b>internal sequencer / pattern data</b>. Disabled by default. Does not touch production
        routing, sequencer, or FLIP.
      </p>
      <p className="muted small">
        Labels:{' '}
        <span className="tag">stock MIDI</span> performance events ·{' '}
        <span className="tag">saved project</span> .ncs / file protocol ·{' '}
        <span className="tag">custom-firmware</span> Remix/Rhythm Plus marker only
      </p>

      <div className="row">
        <button type="button" className={snap.enabled ? 'active' : ''} disabled={busy} onClick={() => void onEnableToggle()}>
          {snap.enabled ? 'Disable Deep Sync' : 'Enable Circuit Deep Sync'}
        </button>
        <button type="button" disabled={!snap.enabled || busy} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide panel' : 'Open panel'}
        </button>
        <button type="button" disabled={!snap.enabled} onClick={() => deepSyncController.downloadReport()}>
          Export JSON report
        </button>
      </div>
      <p className="mono small">{snap.status}</p>
      {err ? <p className="err mono small">{err}</p> : null}

      {snap.enabled && open ? (
        <div className="deep-sync-panel">
          <div className="row wrap">
            <label className="field">
              <span className="muted small">MIDI In</span>
              <select
                value={snap.inputId ?? ''}
                onChange={(e) => deepSyncController.setInputId(e.target.value || null)}
              >
                <option value="">—</option>
                {snap.inputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="muted small">MIDI Out</span>
              <select
                value={snap.outputId ?? ''}
                onChange={(e) => deepSyncController.setOutputId(e.target.value || null)}
              >
                <option value="">—</option>
                {snap.outputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => deepSyncController.clearLogs()}>
              Clear logs
            </button>
          </div>

          <h3>Device / firmware ID</h3>
          <div className="row wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('Identity', () => deepSyncController.probeIdentity())}
            >
              Identity (safe)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('Custom FW', () => deepSyncController.probeCustomFirmware())}
            >
              Custom FW marker (safe)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('Status', () => deepSyncController.probeLoadedStatus())}
            >
              Loaded pack / channels
            </button>
          </div>
          <ul className="event-log">
            {snap.identity ? <li className="mono">ID: {snap.identity.summary}</li> : null}
            {snap.customFirmware ? (
              <li className="mono">
                FW lane: {snap.customFirmware.present ? `custom (${snap.customFirmware.marker})` : 'stock / silent'}
              </li>
            ) : null}
            {snap.loadedStatus ? (
              <li className="mono">
                Loaded pack={String(snap.loadedStatus.loaded)} · channels=
                {snap.loadedStatus.channels?.join(',') ?? '—'}
              </li>
            ) : null}
          </ul>

          <h3>Saved project pattern viewer</h3>
          <p className="muted small">
            Prefer a local <code>.ncs</code> (no device state change). Device read uses stock file
            protocol and <b>stops playback</b> — confirm dialog required.
          </p>
          <div className="row wrap">
            <label className="field">
              <span className="muted small">Local .ncs</span>
              <input
                type="file"
                accept=".ncs,application/octet-stream"
                onChange={(e) => onLocalFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="field">
              <span className="muted small">Pack</span>
              <input
                type="number"
                min={0}
                max={30}
                value={pack}
                onChange={(e) => setPack(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="muted small">Session slot</span>
              <input
                type="number"
                min={0}
                max={63}
                value={sessIndex}
                onChange={(e) => setSessIndex(Number(e.target.value) || 0)}
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void onDeviceRead()}>
              Read saved session from device…
            </button>
          </div>
          {snap.session ? (
            <div className="deep-sync-session">
              <p className="mono small">
                [{snap.session.lane}] {snap.session.header} · {snap.session.byteLength} B · source=
                {snap.session.source}
                {snap.sessionSummary
                  ? ` · non-empty patterns=${snap.sessionSummary.nonEmpty}`
                  : ''}
              </p>
              <p className="muted small">{snap.session.disclaimer}</p>
              <label className="field">
                <span className="muted small">Track</span>
                <select value={viewTrack} onChange={(e) => setViewTrack(Number(e.target.value))}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <option key={i} value={i}>
                      Track {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              {patterns.length === 0 ? (
                <p className="muted">No non-empty patterns on this track in the saved session.</p>
              ) : (
                <div className="deep-sync-patterns">
                  {patterns.map((p) => (
                    <div key={p.slot} className="deep-pat">
                      <div className="mono small">
                        Pattern {p.pattern + 1} · notes {p.noteCount} · steps {p.first + 1}–{p.last + 1} ·
                        lanes {p.lanes.filter((l) => l.hasData).length}
                      </div>
                      <div className="deep-steps" aria-label={`Pattern ${p.pattern + 1} steps`}>
                        {p.steps.map((st) => (
                          <span
                            key={st.index}
                            className={`deep-step${st.on ? ' on' : ''}`}
                            title={
                              st.on
                                ? `step ${st.index + 1} n${st.note} v${st.velocity} micro[${st.microHits.join(',')}]`
                                : `step ${st.index + 1} empty`
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <h3>Raw MIDI monitor</h3>
          <p className="muted small">
            Passive listen on the selected input. Distinguish <b>performance</b> notes from stored
            sequence (only available after a saved-session parse above).
          </p>
          <ul className="event-log deep-log">
            {snap.rawMidiLog
              .slice()
              .reverse()
              .slice(0, 40)
              .map((e, i) => (
                <li key={`${e.at}-${i}`} className="mono">
                  [{e.class}] {e.summary}
                </li>
              ))}
          </ul>

          <h3>Protocol log</h3>
          <ul className="event-log deep-log">
            {snap.protocolLog
              .slice()
              .reverse()
              .slice(0, 40)
              .map((e, i) => (
                <li key={`${e.at}-${i}`} className="mono">
                  {e.direction}/{e.lane}: {e.summary}
                </li>
              ))}
          </ul>

          <h3>Capability matrix (research)</h3>
          <div className="deep-cap-table">
            {CIRCUIT_DEEP_SYNC_CAPABILITIES.map((c) => (
              <div key={c.id} className={`deep-cap tier-${c.tier}`}>
                <div className="mono small">
                  {c.tier} · {c.lane} · {c.safety}
                </div>
                <div>{c.title}</div>
                <div className="muted small">{c.notes}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
