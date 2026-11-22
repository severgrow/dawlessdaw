import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function BridgeWorkspace() {
  const snap = useStudioStore();
  const { setSectionBridge, updateSectionBridgeRow, panic, recallScene } = useStudioActions();
  const spPass = snap.benchResults.find((b) => b.id === 'sp-pattern-pc')?.verdict === 'pass';
  const mpcPass =
    snap.benchResults.find((b) => b.id === 'mpc-sequence-pc')?.verdict === 'pass';

  return (
    <div className="section-enter">
      <h1>Section Bridge</h1>
      <p className="lead">
        When Circuit sends Program Change on channel 16 (Project change), Dawlessdaw can fire SP
        pattern PC, MPC sequence PC, and recall a Studio Scene. Instant = 0–63, queued = 64–127.
      </p>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={snap.sectionBridge.enabled ? 'active' : ''}
          onClick={() =>
            setSectionBridge({
              ...snap.sectionBridge,
              enabled: !snap.sectionBridge.enabled,
            })
          }
        >
          Bridge {snap.sectionBridge.enabled ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="danger" onClick={() => panic()}>
          Panic — All Notes Off
        </button>
      </div>

      <div className="panel">
        <div
          className="list-row"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)' }}
        >
          <div>Circuit Project → SP pattern PC → MPC sequence PC → Studio Scene</div>
        </div>
        {snap.sectionBridge.rows.map((row, i) => (
          <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="row">
              <label className="mono">
                Proj{' '}
                <input
                  className="select-inline"
                  type="number"
                  min={1}
                  max={64}
                  value={row.projectIndex}
                  onChange={(e) =>
                    updateSectionBridgeRow(i, { projectIndex: Number(e.target.value) || 1 })
                  }
                  style={{ width: 64 }}
                />
              </label>
              <label className="mono">
                SP PC{' '}
                <input
                  className="select-inline"
                  type="number"
                  min={0}
                  max={127}
                  value={row.spProgramChange ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    updateSectionBridgeRow(i, {
                      spProgramChange: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ width: 64 }}
                />
              </label>
              <label className="mono">
                MPC PC{' '}
                <input
                  className="select-inline"
                  type="number"
                  min={0}
                  max={127}
                  value={row.mpcProgramChange ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    updateSectionBridgeRow(i, {
                      mpcProgramChange: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ width: 64 }}
                />
              </label>
              <label className="mono">
                Scene{' '}
                <select
                  className="select-inline"
                  value={row.sceneId ?? ''}
                  onChange={(e) =>
                    updateSectionBridgeRow(i, {
                      sceneId: e.target.value || null,
                    })
                  }
                >
                  <option value="">—</option>
                  {snap.scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {row.sceneId ? (
                <button type="button" className="ghost" onClick={() => recallScene(row.sceneId!)}>
                  Recall
                </button>
              ) : null}
            </div>
            <div className="muted mono" style={{ marginTop: 4 }}>
              SP: {spPass ? 'bench pass' : 'hardware testing required'} · MPC:{' '}
              {mpcPass ? 'bench pass' : 'hardware testing required'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
