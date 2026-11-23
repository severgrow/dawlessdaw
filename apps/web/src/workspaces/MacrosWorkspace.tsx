import { useMemo, useState } from 'react';
import {
  SUPER_MACRO_PRESETS,
  createDestinationFromPreset,
  createEmptySuperMacro,
  type MacroCurve,
  type SuperMacro,
  type SuperMacroDestination,
  type TakeoverMode,
} from '@dawlessdaw/devices';
import { HowTo } from '../components/HowTo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const CURVES: MacroCurve[] = ['linear', 'ease-in', 'ease-out', 's-curve'];
const TAKEOVERS: TakeoverMode[] = ['direct', 'pickup', 'relative'];

/**
 * Cross-device Super Macros — Settings panel.
 * Opt-in fan-out + soft takeover + A/B morph + traffic guard.
 * Keeps Controller MIDI Learn unchanged.
 */
export function MacrosWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const sm = snap.superMacros;
  const [selectedId, setSelectedId] = useState<string | null>(sm.macros[0]?.id ?? null);
  const selected = useMemo(
    () => sm.macros.find((m) => m.id === selectedId) ?? sm.macros[0] ?? null,
    [sm.macros, selectedId],
  );

  const updateMacros = (next: SuperMacro[]) => {
    a.getRuntime().setSuperMacros(next);
    if (!next.find((m) => m.id === selectedId)) setSelectedId(next[0]?.id ?? null);
  };

  const patchSelected = (patch: Partial<SuperMacro>) => {
    if (!selected) return;
    updateMacros(sm.macros.map((m) => (m.id === selected.id ? { ...m, ...patch } : m)));
  };

  const patchDest = (destId: string, patch: Partial<SuperMacroDestination>) => {
    if (!selected) return;
    patchSelected({
      destinations: selected.destinations.map((d) => (d.id === destId ? { ...d, ...patch } : d)),
    });
  };

  const addMacro = () => {
    const m = createEmptySuperMacro({ name: `Super Macro ${sm.macros.length + 1}`, enabled: false });
    updateMacros([...sm.macros, m]);
    setSelectedId(m.id);
  };

  const addDest = (presetId: string) => {
    if (!selected) return;
    const d = createDestinationFromPreset(presetId);
    if (!d) return;
    patchSelected({ destinations: [...selected.destinations, d] });
  };

  return (
    <div className="section-enter macros-page">
      <div className="page-head">
        <h1>cross-device macros</h1>
        <span className="ci-badge">experimental</span>
      </div>
      <HowTo sentence="Opt-in Super Macros: one Circuit knob can drive many docs-backed CCs. A/B morph is Splot-owned — not Circuit Scenes.">
        <p>
          Soft takeover: Direct / Pickup / Relative. Traffic is rate-limited and coalesced. Panic disables
          Super Macro output only. Controller MIDI Learn (single destination) stays as-is.
        </p>
      </HowTo>

      <div className="panel sm-traffic">
        <h2>MIDI traffic</h2>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
            <span className="small">Max Hz / dest</span>
            <input
              type="number"
              min={1}
              max={120}
              value={sm.traffic.maxHz}
              onChange={(e) =>
                a.getRuntime().setSuperMacroTraffic({ maxHz: Number(e.target.value) || 30 })
              }
              style={{ width: '4rem' }}
            />
          </label>
          {sm.traffic.disabled ? (
            <button type="button" onClick={() => a.getRuntime().enableSuperMacrosAfterPanic()}>
              Re-enable after panic
            </button>
          ) : (
            <button type="button" className="danger" onClick={() => a.getRuntime().panicSuperMacros()}>
              Panic · disable Super Macros
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const json = a.getRuntime().exportSuperMacrosDiagnostic();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `splot-super-macros-${Date.now()}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </button>
        </div>
        <p className="muted small">
          Output monitor (last-sent by Splot — device state not verified from the wire):
        </p>
        <ul className="sm-monitor mono small">
          {sm.monitor.length === 0 ? <li className="muted">No Super Macro CC sent yet.</li> : null}
          {sm.monitor.slice(0, 8).map((line, i) => (
            <li key={`${line.at}-${i}`}>{line.text}</li>
          ))}
        </ul>
      </div>

      <div className="sm-layout">
        <div className="panel sm-list">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Super Macros</h2>
            <button type="button" onClick={addMacro}>
              Add
            </button>
          </div>
          {sm.macros.length === 0 ? (
            <p className="muted small">None yet — Add, enable, pick destinations from the docs-backed list.</p>
          ) : (
            <ul className="sm-macro-list">
              {sm.macros.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={selected?.id === m.id ? 'active' : 'ghost'}
                    onClick={() => setSelectedId(m.id)}
                  >
                    {m.enabled ? '●' : '○'} {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel sm-editor">
          {!selected ? (
            <p className="muted">Select or add a Super Macro.</p>
          ) : (
            <>
              <label className="field">
                <span>Name</span>
                <input
                  value={selected.name}
                  onChange={(e) => patchSelected({ name: e.target.value })}
                />
              </label>
              <label className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(e) => patchSelected({ enabled: e.target.checked })}
                />
                <span className="small">Enabled (opt-in)</span>
              </label>
              <div className="sm-source row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                <label className="field">
                  <span>Circuit track</span>
                  <select
                    value={selected.sourceTrack}
                    onChange={(e) => patchSelected({ sourceTrack: Number(e.target.value) })}
                  >
                    <option value={0}>Any track</option>
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        T{i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Macro knob</span>
                  <select
                    value={selected.sourceKnob}
                    onChange={(e) => patchSelected({ sourceKnob: Number(e.target.value) })}
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i} value={i}>
                        Knob {i + 1} (CC {21 + i})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <h3>Destinations</h3>
              <label className="field">
                <span>Add docs-backed target</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addDest(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Choose…</option>
                  {SUPER_MACRO_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · CC{p.cc} ({p.honesty})
                    </option>
                  ))}
                </select>
              </label>

              {selected.destinations.map((d) => {
                const st = sm.destState[d.id];
                return (
                  <div key={d.id} className="sm-dest">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{d.label}</strong>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          patchSelected({
                            destinations: selected.destinations.filter((x) => x.id !== d.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <p className="muted small">
                      {d.honesty} · last-sent{' '}
                      {st?.lastSent != null ? st.lastSent : '—'} (device state: unknown)
                      {st?.pickupLatched ? ' · pickup waiting' : ''}
                    </p>
                    <div className="sm-dest-grid">
                      <label className="field">
                        <span>Ch</span>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={d.channel}
                          onChange={(e) => patchDest(d.id, { channel: Number(e.target.value) || 1 })}
                        />
                      </label>
                      <label className="field">
                        <span>CC</span>
                        <input type="number" value={d.cc} disabled title="From docs-backed preset" />
                      </label>
                      <label className="field">
                        <span>Min</span>
                        <input
                          type="number"
                          min={0}
                          max={127}
                          value={d.min}
                          onChange={(e) => patchDest(d.id, { min: Number(e.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>Max</span>
                        <input
                          type="number"
                          min={0}
                          max={127}
                          value={d.max}
                          onChange={(e) => patchDest(d.id, { max: Number(e.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>Curve</span>
                        <select
                          value={d.curve}
                          onChange={(e) => patchDest(d.id, { curve: e.target.value as MacroCurve })}
                        >
                          {CURVES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Takeover</span>
                        <select
                          value={d.takeover}
                          onChange={(e) => {
                            const mode = e.target.value as TakeoverMode;
                            patchDest(d.id, { takeover: mode });
                            if (mode === 'pickup') a.getRuntime().getSuperMacros().latchPickup(d.id);
                          }}
                        >
                          {TAKEOVERS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="row" style={{ gap: '0.75rem', marginTop: '0.35rem' }}>
                      <label className="row" style={{ gap: '0.3rem', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={d.invert}
                          onChange={(e) => patchDest(d.id, { invert: e.target.checked })}
                        />
                        <span className="small">Invert</span>
                      </label>
                      <label className="row" style={{ gap: '0.3rem', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={d.enabled}
                          onChange={(e) => patchDest(d.id, { enabled: e.target.checked })}
                        />
                        <span className="small">Enabled</span>
                      </label>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                className="ghost"
                style={{ marginTop: '0.75rem' }}
                onClick={() => updateMacros(sm.macros.filter((m) => m.id !== selected.id))}
              >
                Delete Super Macro
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel sm-scenes">
        <h2>A/B Macro Scenes</h2>
        <p className="muted small">
          Splot-owned value snapshots for Super Macro destinations — not Circuit Scenes / Project
          memory.
        </p>
        <div className="sm-scene-grid">
          <label className="field">
            <span>Name A</span>
            <input
              value={sm.scenes.nameA}
              onChange={(e) =>
                a.getRuntime().setSuperMacroScenes({ ...sm.scenes, nameA: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Name B</span>
            <input
              value={sm.scenes.nameB}
              onChange={(e) =>
                a.getRuntime().setSuperMacroScenes({ ...sm.scenes, nameB: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Morph ms</span>
            <input
              type="number"
              min={100}
              max={30000}
              value={sm.scenes.morphMs}
              onChange={(e) =>
                a.getRuntime().setSuperMacroScenes({
                  ...sm.scenes,
                  morphMs: Number(e.target.value) || 2000,
                })
              }
            />
          </label>
          <label className="field">
            <span>Curve</span>
            <select
              value={sm.scenes.curve}
              onChange={(e) =>
                a.getRuntime().setSuperMacroScenes({
                  ...sm.scenes,
                  curve: e.target.value as MacroCurve,
                })
              }
            >
              {CURVES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="row" style={{ gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            checked={sm.scenes.barQuantize}
            onChange={(e) =>
              a.getRuntime().setSuperMacroScenes({ ...sm.scenes, barQuantize: e.target.checked })
            }
          />
          <span className="small">Start morph on next bar (needs Circuit clock / musical position)</span>
        </label>
        <div className="row" style={{ marginTop: '0.65rem', flexWrap: 'wrap', gap: '0.45rem' }}>
          <button type="button" onClick={() => a.getRuntime().captureSuperMacroScene('a')}>
            Capture A
          </button>
          <button type="button" onClick={() => a.getRuntime().captureSuperMacroScene('b')}>
            Capture B
          </button>
          <button type="button" onClick={() => a.getRuntime().startSuperMacroMorph('a')}>
            Morph → A
          </button>
          <button type="button" onClick={() => a.getRuntime().startSuperMacroMorph('b')}>
            Morph → B
          </button>
          <button type="button" className="ghost" onClick={() => a.getRuntime().cancelSuperMacroMorph()}>
            Cancel morph
          </button>
        </div>
        {sm.morph.active ? (
          <p className="mono small" role="status">
            Morphing… {(sm.morph.progress * 100).toFixed(0)}%
            {sm.morph.waitBar != null ? ` · waiting for bar ${sm.morph.waitBar}` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}
