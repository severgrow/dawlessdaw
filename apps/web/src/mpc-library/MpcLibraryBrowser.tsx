import { useCallback, useMemo, useState } from 'react';
import {
  FIXTURE_LIBRARY_ENTRIES,
  MPC_LIBRARY_DEFAULT_BASE_URL,
  MPC_LIBRARY_SECTIONS,
  MpcLibraryClient,
  entriesForSection,
  initialMpcLibrarySnapshot,
  type BackupProgress,
  type MpcLibraryClientSnapshot,
  type MpcLibraryEntry,
  type MpcLibrarySectionId,
} from '@dawlessdaw/mpc-library';
import { backupLibraryProject } from './backupProject';
import { importLibraryEntryToFlip } from './importToFlip';

function statusLabel(status: MpcLibraryClientSnapshot['status']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'probing':
      return 'Probing…';
    case 'error':
      return 'Error';
    default:
      return 'Offline';
  }
}

function kindTag(kind: MpcLibraryEntry['kind']): string {
  switch (kind) {
    case 'project':
      return 'XPJ';
    case 'sample':
      return 'WAV';
    case 'folder':
      return 'DIR';
    default:
      return 'FILE';
  }
}

export interface MpcLibraryBrowserProps {
  /** Compact embed (Setup experimental) vs full Sounds → MPC workspace. */
  compact?: boolean;
}

/**
 * Phase D/E — Projects / Audio / Expansions browser + backup / Import→FLIP.
 * Connected only after real companion /health. Fixture preview never claims Connected.
 *
 * Premium design showcase: Ableton-like browser (sections + dense rows + detail),
 * TE-sparse chrome, RC-20 tactile rows. Visual/IA only — no write-to-MPC.
 */
export function MpcLibraryBrowser({ compact = false }: MpcLibraryBrowserProps) {
  const [snap, setSnap] = useState<MpcLibraryClientSnapshot>(() =>
    initialMpcLibrarySnapshot(MPC_LIBRARY_DEFAULT_BASE_URL),
  );
  const [section, setSection] = useState<MpcLibrarySectionId>('projects');
  const [useFixturesWhileOffline, setUseFixturesWhileOffline] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);

  const probe = useCallback(async () => {
    setSnap((s) => ({ ...s, status: 'probing', error: null }));
    const client = new MpcLibraryClient({ baseUrl: MPC_LIBRARY_DEFAULT_BASE_URL });
    const next = await client.probe();
    setSnap(next);
    if (next.status === 'connected') setUseFixturesWhileOffline(false);
  }, []);

  const sourceEntries: readonly MpcLibraryEntry[] = useMemo(() => {
    if (snap.status === 'connected' && snap.entries) return snap.entries;
    if (useFixturesWhileOffline) return FIXTURE_LIBRARY_ENTRIES;
    return [];
  }, [snap.status, snap.entries, useFixturesWhileOffline]);

  const listing = useMemo(
    () => entriesForSection(sourceEntries, section),
    [sourceEntries, section],
  );

  const showingFixturesOnly = snap.status !== 'connected';
  const selected = listing.find((e) => e.id === selectedId) ?? null;

  const canImportFlip = selected?.kind === 'sample';
  const canBackup =
    Boolean(selected) || entriesForSection(sourceEntries, 'projects').length > 0;

  const runBackup = useCallback(async () => {
    setBusy(true);
    setActionMsg(null);
    setProgress({ done: 0, total: 1, currentPath: null });
    try {
      const result = await backupLibraryProject({
        allEntries: sourceEntries,
        selected,
        onProgress: setProgress,
      });
      setActionMsg(result.message);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [sourceEntries, selected]);

  const runImportFlip = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const result = await importLibraryEntryToFlip(selected);
      setActionMsg(result.message);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }, [selected]);

  const statusTone =
    snap.status === 'connected' ? 'on' : snap.status === 'error' ? 'err' : 'off';

  return (
    <div
      className={`mpc-lib-browser${compact ? ' mpc-lib-browser--compact' : ''}`}
      data-mpc-library-phase="premium"
      data-status={snap.status}
    >
      <header className="mpc-lib-head">
        <div className="mpc-lib-title-row">
          <h2 className="mpc-lib-title">MPC Library</h2>
          <span className="ci-badge">experimental</span>
          <span
            className={`mpc-lib-status mpc-lib-status--${statusTone}`}
            data-testid="mpc-lib-status"
          >
            <span className="mpc-lib-status-led" aria-hidden />
            {statusLabel(snap.status)}
          </span>
        </div>
        <div className="mpc-lib-toolbar" role="toolbar" aria-label="Library actions">
          <button
            type="button"
            className="mpc-lib-probe"
            onClick={() => void probe()}
            disabled={snap.status === 'probing' || busy}
          >
            Probe
          </button>
          {snap.status !== 'connected' ? (
            <button
              type="button"
              className={useFixturesWhileOffline ? 'active' : 'ghost'}
              onClick={() => setUseFixturesWhileOffline((v) => !v)}
              disabled={busy}
            >
              Fixtures
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canImportFlip || busy}
            title={canImportFlip ? 'Import sample → FLIP (gain 1)' : 'Select an Audio WAV'}
            onClick={() => void runImportFlip()}
            data-testid="mpc-lib-import-flip"
          >
            Import FLIP
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!canBackup || busy}
            title="Back up project — never silent overwrite"
            onClick={() => void runBackup()}
            data-testid="mpc-lib-backup"
          >
            Back up
          </button>
        </div>
      </header>

      {progress ? (
        <p className="mpc-lib-progress muted small mono" data-testid="mpc-lib-progress">
          Backup {progress.done}/{progress.total}
          {progress.currentPath ? ` · ${progress.currentPath}` : ''}
        </p>
      ) : null}

      {actionMsg ? (
        <p className="mpc-lib-action-msg" data-testid="mpc-lib-action-msg">
          {actionMsg}
        </p>
      ) : null}

      {snap.error ? <p className="warn small mono mpc-lib-err">{snap.error}</p> : null}

      {showingFixturesOnly && useFixturesWhileOffline ? (
        <p className="mpc-lib-fixture-banner" data-testid="mpc-lib-fixture-banner">
          Fixtures · still Offline
        </p>
      ) : null}

      {!useFixturesWhileOffline && snap.status !== 'connected' ? (
        <p className="mpc-lib-hint muted small">
          Offline · <code className="mono">npm run mpc-library</code> then Probe
        </p>
      ) : null}

      {/* Ableton-like browser: section rail + list/detail stage */}
      <div className="mpc-lib-body">
        <div className="mpc-lib-sections" role="tablist" aria-label="Library sections">
          {MPC_LIBRARY_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={`mpc-lib-section${section === s.id ? ' active' : ''}`}
              disabled={busy}
              onClick={() => {
                setSection(s.id);
                setSelectedId(null);
              }}
            >
              <span className="mpc-lib-section-label">{s.label}</span>
              <span className="mpc-lib-count mono">
                {entriesForSection(sourceEntries, s.id).length}
              </span>
            </button>
          ))}
        </div>

        <div className="mpc-lib-stage">
          <ul className="mpc-lib-list" data-testid="mpc-lib-list">
            {listing.length === 0 ? (
              <li className="mpc-lib-empty muted small">Nothing in {section}</li>
            ) : (
              listing.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`mpc-lib-row${selectedId === e.id ? ' selected' : ''}`}
                    disabled={busy}
                    onClick={() => setSelectedId(e.id)}
                  >
                    <span className="mpc-lib-kind mono">{kindTag(e.kind)}</span>
                    <span className="mpc-lib-name">{e.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {selected ? (
            <div className="mpc-lib-detail">
              <div className="mpc-lib-detail-name">{selected.name}</div>
              <div className="mpc-lib-detail-path mono">{selected.relativePath}</div>
              <div className="mpc-lib-detail-actions">
                <button
                  type="button"
                  disabled={!canImportFlip || busy}
                  onClick={() => void runImportFlip()}
                >
                  Import FLIP
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void runBackup()}
                >
                  Back up
                </button>
              </div>
            </div>
          ) : (
            <div className="mpc-lib-detail mpc-lib-detail--empty muted small">
              Select a row
            </div>
          )}
        </div>
      </div>

      {snap.health ? (
        <p className="muted small mono mpc-lib-meta">
          {snap.health.mode} · v{snap.health.version} · SSH off
        </p>
      ) : null}
    </div>
  );
}
