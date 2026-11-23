import { useCallback, useState } from 'react';
import {
  FIXTURE_LIBRARY_ENTRIES,
  MPC_LIBRARY_DEFAULT_BASE_URL,
  MpcLibraryClient,
  initialMpcLibrarySnapshot,
  type MpcLibraryClientSnapshot,
} from '@dawlessdaw/mpc-library';

/**
 * Phase C — honest Library companion status.
 * Offline until a real loopback /health succeeds. Never fakes Connected.
 * Separate from Network MIDI.
 */
export function MpcLibraryPanel() {
  const [snap, setSnap] = useState<MpcLibraryClientSnapshot>(() =>
    initialMpcLibrarySnapshot(MPC_LIBRARY_DEFAULT_BASE_URL),
  );
  const [showFixturePreview, setShowFixturePreview] = useState(false);

  const probe = useCallback(async () => {
    setSnap((s) => ({ ...s, status: 'probing', error: null }));
    const client = new MpcLibraryClient({ baseUrl: MPC_LIBRARY_DEFAULT_BASE_URL });
    const next = await client.probe();
    setSnap(next);
  }, []);

  const statusLabel =
    snap.status === 'connected'
      ? 'Connected'
      : snap.status === 'probing'
        ? 'Probing…'
        : snap.status === 'error'
          ? 'Error'
          : 'Offline';

  const statusClass =
    snap.status === 'connected' ? '' : snap.status === 'probing' ? 'muted' : 'warn';

  return (
    <div className="panel" data-mpc-library-phase="c">
      <h3>
        MPC Library companion <span className="ci-badge">experimental</span>
      </h3>
      <p className="muted small">
        Optional local Mac helper (loopback only) — <strong>not</strong> Network MIDI. Read-only
        fixtures PoC. No shell, no SSH, no expansion-builder.
      </p>
      <p className={statusClass}>
        Status: <strong>{statusLabel}</strong>
        {snap.status !== 'connected' ? ' — companion not running (honest Offline)' : null}
      </p>
      {snap.error ? <p className="warn small mono">{snap.error}</p> : null}
      <div className="row">
        <button type="button" onClick={() => void probe()} disabled={snap.status === 'probing'}>
          Probe 127.0.0.1:8787
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setShowFixturePreview((v) => !v)}
        >
          {showFixturePreview ? 'Hide fixture preview' : 'Show fixture preview'}
        </button>
      </div>
      <p className="muted small mono">
        Start helper: <code>node scripts/mpc-library-companion.mjs</code>
      </p>
      {snap.status === 'connected' && snap.entries ? (
        <ul className="cap-list mono small">
          {snap.entries.map((e) => (
            <li key={e.id}>
              [{e.kind}] {e.relativePath}
            </li>
          ))}
        </ul>
      ) : null}
      {showFixturePreview ? (
        <div className="callout">
          <p className="muted small">
            Fixture preview only — still <strong>Offline</strong> unless status is Connected.
          </p>
          <ul className="cap-list mono small">
            {FIXTURE_LIBRARY_ENTRIES.map((e) => (
              <li key={e.id}>
                [{e.kind}] {e.relativePath}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snap.health ? (
        <p className="muted small">
          mode={snap.health.mode} · v{snap.health.version} · SSH{' '}
          {snap.health.ssh.available ? 'available' : 'unavailable'}
        </p>
      ) : null}
    </div>
  );
}
