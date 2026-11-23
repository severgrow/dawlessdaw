import { useState } from 'react';
import { SP_MODE_A_BANKS, type SpModeABank } from '@dawlessdaw/devices';
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

/**
 * Phase 2 — visual song section cards with drag reorder.
 * Still drives Section Bridge (Circuit Project → SP / MPC / scene).
 */
export function SectionsWorkspace() {
  const snap = useStudioStore();
  const { setSectionBridge, updateSectionBridgeRow, reorderSectionBridgeRows } = useStudioActions();
  const bridge = snap.sectionBridge;
  const pass = (id: string) => snap.benchResults.find((b) => b.id === id)?.verdict === 'pass';
  const spInModeA = Object.values(snap.trackPlan).some((sends) => sends.some((s) => s.dest === 'sp'));
  const last = snap.lastProject;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const removeRow = (i: number) =>
    setSectionBridge({ ...bridge, rows: bridge.rows.filter((_, j) => j !== i) });
  const addRow = () => {
    const next = Math.min(64, Math.max(0, ...bridge.rows.map((r) => r.projectIndex)) + 1);
    const meta = snap.circuitProjects[next - 1];
    setSectionBridge({
      ...bridge,
      rows: [
        ...bridge.rows,
        {
          projectIndex: next,
          spProgramChange: null,
          mpcProgramChange: null,
          sceneId: null,
          label: meta?.name && meta.name !== `Project ${next}` ? meta.name : '',
        },
      ],
    });
  };

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>song sections</h1>
        <button
          type="button"
          className={bridge.enabled ? 'active' : ''}
          onClick={() => setSectionBridge({ ...bridge, enabled: !bridge.enabled })}
        >
          Section Bridge {bridge.enabled ? 'on' : 'off'}
        </button>
      </div>
      <p className="lead">
        When you change Project on the Circuit, jump SP pattern + MPC sequence together. Needs Circuit{' '}
        <strong>Program Change Tx</strong> on (ch 16). Drag cards to reorder the setlist.
      </p>

      <div className="panel">
        <h2>Performance Memory event-actions</h2>
        <p className="muted small">
          Optional replay of <strong>confirmed</strong> project-change markers through Section Bridge.
          Off by default. Inferred events (possible pattern change / mute) never auto-fill SP or MPC.
        </p>
        <button
          type="button"
          className={bridge.eventActionsEnabled ? 'active' : ''}
          onClick={() =>
            setSectionBridge({
              ...bridge,
              eventActionsEnabled: !bridge.eventActionsEnabled,
            })
          }
        >
          Event-actions {bridge.eventActionsEnabled ? 'on' : 'off'} · experimental
        </button>
      </div>

      <div className="panel">
        <h2>Last Circuit project</h2>
        {last ? (
          <p className="mono">
            Project {last.index}
            {snap.circuitProjects[last.index - 1]
              ? ` · ${snap.circuitProjects[last.index - 1]!.name}`
              : ''}{' '}
            ({last.kind}) · {last.matched ? 'sent' : bridge.enabled ? 'no row' : 'bridge off'} ·{' '}
            {new Date(last.at).toLocaleTimeString()}
          </p>
        ) : (
          <p className="muted">Nothing yet — change Project on the Circuit.</p>
        )}
      </div>

      <div className="panel">
        <h2>Section cards</h2>
        <div className="section-cards" role="list" aria-label="Song section cards">
          {bridge.rows.map((row, i) => {
            const colour = snap.circuitProjects[row.projectIndex - 1]?.colour ?? '#9fdcc2';
            const hit = last?.matched && last.index === row.projectIndex;
            return (
              <article
                key={`${row.projectIndex}-${i}`}
                className={`section-card${hit ? ' hit' : ''}${dragOver === i ? ' drag-over' : ''}${dragFrom === i ? ' dragging' : ''}`}
                role="listitem"
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom != null) reorderSectionBridgeRows(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                style={{ borderTopColor: colour }}
              >
                <header className="section-card-head">
                  <span className="section-card-grip" aria-hidden>
                    ⋮⋮
                  </span>
                  <input
                    className="text-input section-card-title"
                    type="text"
                    maxLength={40}
                    placeholder="e.g. verse"
                    aria-label="Section name"
                    value={row.label ?? ''}
                    onChange={(e) => updateSectionBridgeRow(i, { label: e.target.value })}
                  />
                  <button type="button" className="send-remove" aria-label="Remove section" onClick={() => removeRow(i)}>
                    ×
                  </button>
                </header>
                <label className="section-card-field">
                  Circuit project
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
                </label>
                <label className="section-card-field">
                  SP pattern
                  <PcInput
                    value={row.spProgramChange}
                    max={16}
                    label="SP pattern"
                    onChange={(v) => updateSectionBridgeRow(i, { spProgramChange: v })}
                  />
                </label>
                <label className="section-card-field">
                  SP bank (Mode A PC)
                  <select
                    className="select-inline"
                    aria-label="SP bank for Mode A pattern PC"
                    value={row.spBank ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSectionBridgeRow(i, {
                        spBank: v && (SP_MODE_A_BANKS as readonly string[]).includes(v)
                          ? (v as SpModeABank)
                          : null,
                      });
                    }}
                  >
                    <option value="">ch13 (legacy bridge)</option>
                    {SP_MODE_A_BANKS.map((b) => (
                      <option key={b} value={b}>
                        Bank {b} · ch {SP_MODE_A_BANKS.indexOf(b) + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="section-card-field">
                  MPC sequence
                  <PcInput
                    value={row.mpcProgramChange}
                    max={128}
                    label="MPC sequence"
                    onChange={(v) => updateSectionBridgeRow(i, { mpcProgramChange: v })}
                  />
                </label>
              </article>
            );
          })}
        </div>
        <button type="button" className="ghost" onClick={addRow} disabled={bridge.rows.length >= 64}>
          + Add section
        </button>
        {spInModeA ? (
          <p className="warn">
            SP Mode A (notes) — legacy pattern PC on ch 13 may fail (bench e). Prefer a Mode A bank
            above (PC on that bank’s channel) — still unverified until you confirm.
          </p>
        ) : null}
        <MoreInfo>
          <p className="muted small">
            Empty SP pattern = send nothing. Legacy bridge uses ch 13{' '}
            {pass('sp-pattern-pc') ? '(bench pass)' : '(bench e pending)'}. Mode A bank PC (Phase 3)
            is hardware-testing-required. MPC sequence PC on ch 15{' '}
            {pass('mpc-sequence-pc') ? '(bench pass)' : '(bench f pending)'}. Drag to reorder the
            setlist view only — matching still uses Circuit project number.
          </p>
        </MoreInfo>
      </div>
    </div>
  );
}
