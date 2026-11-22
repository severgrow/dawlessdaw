import { MoreInfo } from '../components/MoreInfo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/** Number box that shows 1-based numbers but stores 0-based Program Change values. */
function PcInput({
  value,
  max,
  label,
  onChange,
}: {
  value: number | null;
  max: number;
  label: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      className="num-input"
      type="number"
      min={1}
      max={max}
      aria-label={label}
      placeholder="—"
      value={value == null ? '' : value + 1}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(e.target.value === '' || !Number.isFinite(n) ? null : Math.max(1, Math.min(max, Math.round(n))) - 1);
      }}
    />
  );
}

export function SectionsWorkspace() {
  const snap = useStudioStore();
  const { setSectionBridge, updateSectionBridgeRow } = useStudioActions();
  const bridge = snap.sectionBridge;
  const pass = (id: string) => snap.benchResults.find((b) => b.id === id)?.verdict === 'pass';
  const spInModeA = Object.values(snap.trackPlan).some((sends) => sends.some((s) => s.dest === 'sp'));
  const last = snap.lastProject;

  const removeRow = (i: number) =>
    setSectionBridge({ ...bridge, rows: bridge.rows.filter((_, j) => j !== i) });
  const addRow = () => {
    const next = Math.min(64, Math.max(0, ...bridge.rows.map((r) => r.projectIndex)) + 1);
    setSectionBridge({
      ...bridge,
      rows: [
        ...bridge.rows,
        { projectIndex: next, spProgramChange: null, mpcProgramChange: null, sceneId: null, label: '' },
      ],
    });
  };

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>sections</h1>
        <button
          type="button"
          className={bridge.enabled ? 'active' : ''}
          onClick={() => setSectionBridge({ ...bridge, enabled: !bridge.enabled })}
        >
          Section Bridge {bridge.enabled ? 'on' : 'off'}
        </button>
      </div>
      <p className="lead">
        Circuit Project → SP pattern + MPC sequence. Needs Circuit <strong>Program Change Tx</strong> on (ch 16).
      </p>

      <div className="panel">
        <h2>Last Circuit project</h2>
        {last ? (
          <p className="mono">
            Project {last.index} ({last.kind}) ·{' '}
            {last.matched ? 'sent' : bridge.enabled ? 'no row' : 'bridge off'} ·{' '}
            {new Date(last.at).toLocaleTimeString()}
          </p>
        ) : (
          <p className="muted">Nothing yet — change Project on the Circuit.</p>
        )}
      </div>

      <div className="panel">
        <h2>Project → pattern / sequence</h2>
        <div className="sections-table" role="table" aria-label="Section Bridge rows">
          <div className="st-row st-head" role="row">
            <span role="columnheader">Circuit project</span>
            <span role="columnheader">SP pattern</span>
            <span role="columnheader">MPC sequence</span>
            <span role="columnheader">Name</span>
            <span role="columnheader" aria-label="Remove" />
          </div>
          {bridge.rows.map((row, i) => (
            <div
              key={i}
              className={`st-row${last?.matched && last.index === row.projectIndex ? ' st-hit' : ''}`}
              role="row"
            >
              <span role="cell">
                <input
                  className="num-input"
                  type="number"
                  min={1}
                  max={64}
                  aria-label="Circuit project"
                  value={row.projectIndex}
                  onChange={(e) =>
                    updateSectionBridgeRow(i, {
                      projectIndex: Math.max(1, Math.min(64, Math.round(Number(e.target.value) || 1))),
                    })
                  }
                />
              </span>
              <span role="cell">
                <PcInput
                  value={row.spProgramChange}
                  max={16}
                  label="SP pattern"
                  onChange={(v) => updateSectionBridgeRow(i, { spProgramChange: v })}
                />
              </span>
              <span role="cell">
                <PcInput
                  value={row.mpcProgramChange}
                  max={128}
                  label="MPC sequence"
                  onChange={(v) => updateSectionBridgeRow(i, { mpcProgramChange: v })}
                />
              </span>
              <span role="cell">
                <input
                  className="text-input"
                  type="text"
                  maxLength={40}
                  placeholder="e.g. verse"
                  aria-label="Section name"
                  value={row.label ?? ''}
                  onChange={(e) => updateSectionBridgeRow(i, { label: e.target.value })}
                />
              </span>
              <span role="cell">
                <button type="button" className="send-remove" aria-label="Remove row" onClick={() => removeRow(i)}>
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" className="ghost" onClick={addRow} disabled={bridge.rows.length >= 64}>
          + Add project
        </button>
        {spInModeA ? (
          <p className="warn">SP Mode A (notes) — pattern PC on ch 13 may fail (bench e).</p>
        ) : null}
        <MoreInfo>
          <p className="muted small">
            Empty box = send nothing. SP pattern PC on ch 13{' '}
            {pass('sp-pattern-pc') ? '(bench pass)' : '(bench e pending)'}. MPC sequence PC on ch 15{' '}
            {pass('mpc-sequence-pc') ? '(bench pass)' : '(bench f pending)'}.
          </p>
        </MoreInfo>
      </div>
    </div>
  );
}
