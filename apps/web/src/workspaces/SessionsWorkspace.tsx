import { useState } from 'react';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function SessionsWorkspace() {
  const snap = useStudioStore();
  const { exportSession, importSession } = useStudioActions();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="section-enter">
      <h1>Sessions</h1>
      <p className="lead">
        JSON import/export with schemaVersion={snap.session.schemaVersion}. Local-first; IndexedDB
        when available.
      </p>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={() => {
            setRaw(exportSession());
            setError(null);
          }}
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              importSession(raw);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Import JSON
        </button>
      </div>
      {error ? <p style={{ color: 'var(--err)' }}>{error}</p> : null}
      <textarea
        className="session-io"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Session JSON…"
        spellCheck={false}
      />
      <div className="panel" style={{ marginTop: '1rem' }}>
        <h2>Scenes in session</h2>
        {snap.scenes.map((s) => (
          <div key={s.id} className="list-row">
            <div>
              <strong>{s.name}</strong>
              <div className="path">{s.id}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
