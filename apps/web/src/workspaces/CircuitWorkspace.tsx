import { useMemo, useState } from 'react';
import {
  CIRCUIT_RHYTHM_DOC,
  CIRCUIT_SETUP_STEPS,
  type CircuitSetupStep,
} from '@dawlessdaw/devices';
import { CircuitIntelligencePanel } from '../components/CircuitIntelligencePanel';
import { MoreInfo } from '../components/MoreInfo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const SETUP_DONE_KEY = 'dawlessdaw.circuitSetupDone';

function loadSetupDone(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SETUP_DONE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveSetupDone(done: Record<string, boolean>): void {
  try {
    localStorage.setItem(SETUP_DONE_KEY, JSON.stringify(done));
  } catch {
    /* ignore */
  }
}

function tickFresh(lastAt: number | null, windowMs = 2500): boolean {
  return lastAt != null && Date.now() - lastAt < windowMs;
}

function SetupPicture({ step }: { step: CircuitSetupStep }) {
  const label =
    step.tick === 'note'
      ? '♪'
      : step.tick === 'cc'
        ? '◎'
        : step.tick === 'pc'
          ? 'P'
          : '◷';
  return (
    <div className={`c2-pic c2-pic-${step.picture}`} aria-hidden>
      <span className="c2-pic-glyph">{label}</span>
      <span className="c2-pic-caption">{step.title}</span>
    </div>
  );
}

/**
 * Phase 2 — deeper Circuit Rhythm: setup checklist + live ticks,
 * “What’s my Circuit doing”, 64-slot project grid.
 * Experimental until hardware confirm. Reuses Circuit Intelligence / Mirror.
 */
export function CircuitWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const [done, setDone] = useState(loadSetupDone);
  const [gridFilter, setGridFilter] = useState('');
  const ticks = snap.circuitLiveTicks;
  const intel = snap.circuitIntelligence;
  const circuitIn = Boolean(snap.assignments.find((x) => x.roleId === 'circuit')?.inputPortId);

  const tickLive = useMemo(
    () => ({
      note: tickFresh(ticks.note.lastAt),
      cc: tickFresh(ticks.cc.lastAt),
      pc: tickFresh(ticks.pc.lastAt),
      clock: tickFresh(ticks.clock.lastAt, 400),
    }),
    [ticks],
  );

  const toggleDone = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    saveSetupDone(next);
  };

  const filtered = snap.circuitProjects.filter((s) => {
    if (!gridFilter.trim()) return true;
    const q = gridFilter.trim().toLowerCase();
    return s.name.toLowerCase().includes(q) || String(s.index).includes(q);
  });

  const last = snap.lastProject;
  const activeSlot = last ? snap.circuitProjects[last.index - 1] : null;

  return (
    <div className="section-enter circuit-phase2">
      <div className="page-head">
        <h1>circuit</h1>
        <span className="ci-badge">experimental</span>
        <span className="readout">
          Circuit {circuitIn ? <b>connected</b> : 'not connected'}
        </span>
      </div>
      <p className="lead">
        Checklist · live ticks · 64 Projects. Listen only — no SysEx.
      </p>

      <div className="panel c2-ticks" role="status" aria-label="Live Circuit TX ticks">
        <h2>Live ticks</h2>
        <div className="c2-tick-row">
          {(
            [
              ['note', 'Note Tx', ticks.note],
              ['cc', 'CC Tx', ticks.cc],
              ['pc', 'PC Tx', ticks.pc],
              ['clock', 'Clock Tx', ticks.clock],
            ] as const
          ).map(([key, label, t]) => (
            <div
              key={key}
              className={`c2-tick${tickLive[key] ? ' live' : ''}`}
              title={t.lastAt ? new Date(t.lastAt).toLocaleTimeString() : 'none yet'}
            >
              <b>{label}</b>
              <span className="mono">{t.count}</span>
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => a.resetCircuitLiveTicks()}>
            Reset counts
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Circuit setup checklist</h2>
        <ol className="c2-checklist">
          {CIRCUIT_SETUP_STEPS.map((step) => {
            const live = tickLive[step.tick];
            return (
              <li key={step.id} className={done[step.id] ? 'done' : ''}>
                <label className="c2-check-label">
                  <input
                    type="checkbox"
                    checked={Boolean(done[step.id])}
                    onChange={() => toggleDone(step.id)}
                  />
                  <span>
                    <strong>{step.title}</strong>
                    {live ? <span className="c2-live-pill">hearing {step.tick}</span> : null}
                  </span>
                </label>
                <SetupPicture step={step} />
                <p className="muted small">{step.how}</p>
                <p className="mono small muted">{step.cite}</p>
              </li>
            );
          })}
        </ol>
        <MoreInfo>
          <p className="muted small">
            Note / CC / Program Change / Clock Transmit are independent on Circuit Rhythm (PRG v5 +
            User Guide). Splot never turns Clock Tx on for you. Keep one clock leader only.
          </p>
        </MoreInfo>
      </div>

      <div className="panel" role="region" aria-label="What's my Circuit doing">
        <h2>What&apos;s my Circuit doing</h2>
        <p className="muted small">
          Same passive Intelligence as Circuit Live — guesses only, never auto-mute. Open Build →
          Splot pattern → Circuit Live for the 8×16 mirror.
        </p>
        {activeSlot ? (
          <p className="mono">
            Project{' '}
            <b style={{ color: activeSlot.colour }}>
              {activeSlot.index} · {activeSlot.name}
            </b>{' '}
            ({last?.kind}) · {last?.matched ? 'section matched' : 'no section row'}
          </p>
        ) : (
          <p className="muted">No Project Change heard yet (need PC Tx + ch16).</p>
        )}
        <CircuitIntelligencePanel intel={intel} />
      </div>

      <div className="panel">
        <div className="page-head">
          <h2>64 Projects</h2>
          <input
            className="text-input"
            type="search"
            placeholder="Filter name or number"
            aria-label="Filter projects"
            value={gridFilter}
            onChange={(e) => setGridFilter(e.target.value)}
          />
        </div>
        <p className="muted small">
          Names and colours are yours — Splot stores them locally. Slot = Circuit Project 1–64 (PC
          ch16). Tie them to song sections under Build → Song sections.
        </p>
        <div className="c2-project-grid" role="list">
          {filtered.map((slot) => {
            const hit = last?.index === slot.index;
            return (
              <div
                key={slot.index}
                className={`c2-project${hit ? ' hit' : ''}`}
                role="listitem"
                style={{ borderColor: slot.colour }}
              >
                <div className="c2-project-head">
                  <span className="c2-swatch" style={{ background: slot.colour }} />
                  <b className="mono">{slot.index}</b>
                </div>
                <input
                  className="text-input"
                  type="text"
                  maxLength={40}
                  aria-label={`Name for project ${slot.index}`}
                  value={slot.name}
                  onChange={(e) => a.setCircuitProjectSlot(slot.index, { name: e.target.value })}
                />
                <input
                  className="c2-colour"
                  type="color"
                  aria-label={`Colour for project ${slot.index}`}
                  value={/^#[0-9a-fA-F]{6}$/.test(slot.colour) ? slot.colour : '#9fdcc2'}
                  onChange={(e) => a.setCircuitProjectSlot(slot.index, { colour: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Knob soft takeover</h2>
        <p className="muted small">
          Off by default. When on, Super Macro destinations use pickup (same engine as Settings →
          Macros) so twisting a Circuit knob does not jump the parameter. Unit-tested. Experimental
          until hardware confirm.
        </p>
        <button
          type="button"
          className={snap.controllerKnobPickup ? 'active' : ''}
          onClick={() => a.setControllerKnobPickup(!snap.controllerKnobPickup)}
        >
          Soft takeover {snap.controllerKnobPickup ? 'on' : 'off'}
        </button>
      </div>

      <div className="panel">
        <h2>.ncs import</h2>
        <p className="callout" role="status">
          <strong>Experimental</strong> — prefer a local <code>.ncs</code> from an SD card reader
          (Components / Remix export). USB file protocol stops Circuit playback — only after you
          confirm in Tests → Deep Sync (experimental tools on). See Build → Splot pattern → Circuit
          Saved for local open.
        </p>
      </div>
    </div>
  );
}
