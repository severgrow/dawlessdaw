import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { destBadge, parseNcsSession, summarizeSession } from '@dawlessdaw/devices';
import {
  cellsFromNcsPattern,
  MIRROR_STEP_COUNT,
  MIRROR_TRACK_COUNT,
  type CircuitMirrorSnapshot,
  type MirrorCell,
  type SequencerViewMode,
} from '@dawlessdaw/sequencer';
import { CircuitIntelligencePanel } from '../components/CircuitIntelligencePanel';
import { CircuitMirrorGrid } from '../components/CircuitMirrorGrid';
import { MoreInfo } from '../components/MoreInfo';
import { FlipLane } from '../flip/FlipLane';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

const MODE_KEY = 'dawlessdaw.circuitMirror.mode';
/** Pass D: Pattern first (playable default); Live/Saved are progressive disclosure. */
const MODES: { id: SequencerViewMode; label: string; blurb: string }[] = [
  {
    id: 'splot-pattern',
    label: 'Pattern',
    blurb: 'Editable 8×16 grid → Controller destinations',
  },
  {
    id: 'circuit-live',
    label: 'Live',
    blurb: 'Read-only view of Circuit performance MIDI (input only)',
  },
  {
    id: 'circuit-saved',
    label: 'Saved',
    blurb: 'View a local .ncs file — not live RAM',
  },
];

function loadModePref(): SequencerViewMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY) as SequencerViewMode | null;
    if (v === 'circuit-live' || v === 'circuit-saved' || v === 'splot-pattern') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function saveModePref(mode: SequencerViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function useCircuitMirror(): CircuitMirrorSnapshot {
  const { getRuntime } = useStudioActions();
  const eng = getRuntime().getCircuitMirror();
  return useSyncExternalStore(
    (cb) => eng.subscribe(cb),
    () => eng.getSnapshot(),
    () => eng.getSnapshot(),
  );
}

function useCircuitIntelligence() {
  const { getRuntime } = useStudioActions();
  const eng = getRuntime().getCircuitIntelligence();
  return useSyncExternalStore(
    (cb) => eng.subscribe(cb),
    () => eng.getSnapshot(),
    () => eng.getSnapshot(),
  );
}

function emptyMirrorSnap(): CircuitMirrorSnapshot {
  const tracks: MirrorCell[][] = Array.from({ length: MIRROR_TRACK_COUNT }, () =>
    Array.from({ length: MIRROR_STEP_COUNT }, () => ({
      kind: 'empty' as const,
      note: 60,
      velocity: 0,
    })),
  );
  return {
    playing: false,
    playhead: -1,
    length: MIRROR_STEP_COUNT,
    cycle: 0,
    tickCount: 0,
    tracks,
    lastNote: null,
    listening: true,
    honesty: 'experimental',
  };
}

/**
 * Sequencer workspace (Pass D): Pattern-first when no Circuit; Live/Saved optional.
 * Circuit Live listens to Circuit input MIDI only — never changes outbound routing.
 */
export function SequencerWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const mirror = useCircuitMirror();
  const intel = useCircuitIntelligence();
  const circuitIn = snap.assignments.find((x) => x.roleId === 'circuit')?.inputPortId;
  const seq = snap.sequencer;
  const pattern = seq.bank.patterns[seq.bank.activePatternIndex]!;
  const selected = snap.sequencerSelected;
  const selStep = pattern.tracks[selected.track - 1]?.steps[selected.step];

  const [mode, setMode] = useState<SequencerViewMode>(() => {
    const pref = loadModePref();
    if (pref) return pref;
    // Pass D: playable Pattern by default (no Circuit jargon wall).
    return 'splot-pattern';
  });
  const [userPickedMode, setUserPickedMode] = useState(() => loadModePref() != null);

  // Offer Live only when Circuit is connected + active — never override a saved pick.
  useEffect(() => {
    if (userPickedMode) return;
    if (circuitIn && (mirror.playing || mirror.lastNote || snap.estimatedBpm != null)) {
      setMode('circuit-live');
    }
  }, [circuitIn, mirror.playing, mirror.lastNote, snap.estimatedBpm, userPickedMode]);

  const pickMode = (m: SequencerViewMode) => {
    setUserPickedMode(true);
    setMode(m);
    saveModePref(m);
  };

  // —— Circuit Saved (.ncs) ——
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [savedPatternIndex, setSavedPatternIndex] = useState(0);
  const [savedTracks, setSavedTracks] = useState<MirrorCell[][] | null>(null);
  const [ncsPatterns, setNcsPatterns] = useState<
    { track: number; pattern: number; steps: { on: boolean; note: number; velocity: number }[] }[] | null
  >(null);

  const loadNcs = useCallback(async (file: File | null) => {
    setSavedError(null);
    setSavedSummary(null);
    setSavedTracks(null);
    setNcsPatterns(null);
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const session = parseNcsSession(buf, 'local-ncs');
      const sum = summarizeSession(session);
      setSavedSummary(
        `${session.header} · ${sum.nonEmpty} non-empty patterns · ${session.disclaimer}`,
      );
      setNcsPatterns(
        session.patterns.map((p) => ({
          track: p.track,
          pattern: p.pattern,
          steps: p.steps.map((s) => ({ on: s.on, note: s.note, velocity: s.velocity })),
        })),
      );
      const rows: MirrorCell[][] = [];
      for (let t = 0; t < 8; t++) {
        const p = session.patterns[t * 8 + 0];
        rows.push(cellsFromNcsPattern(p?.steps ?? []));
      }
      setSavedTracks(rows);
      setSavedPatternIndex(0);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const switchSavedPattern = (pat: number) => {
    if (!ncsPatterns) return;
    const rows: MirrorCell[][] = [];
    for (let t = 0; t < 8; t++) {
      const p = ncsPatterns.find((x) => x.track === t && x.pattern === pat);
      rows.push(cellsFromNcsPattern(p?.steps ?? []));
    }
    setSavedTracks(rows);
    setSavedPatternIndex(pat);
  };

  const savedSnap = useMemo((): CircuitMirrorSnapshot => {
    const base = emptyMirrorSnap();
    if (!savedTracks) return base;
    return {
      ...base,
      tracks: savedTracks,
      playing: false,
      playhead: -1,
      cycle: 0,
    };
  }, [savedTracks]);

  const downloadMirrorDiag = () => {
    const json = a.getRuntime().exportCircuitMirrorDiagnostic();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `splot-circuit-mirror-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const pageTitle =
    mode === 'splot-pattern' ? 'pattern' : mode === 'circuit-live' ? 'live view' : 'saved .ncs';

  return (
    <div className="section-enter seq-page">
      <div className="page-head">
        <h1>{pageTitle}</h1>
        <span className="seq-brand-chip" title="Product brand">
          Splot MIDI Brain
        </span>
      </div>
      <p className="lead">
        {mode === 'splot-pattern'
          ? 'Play · Stop · Record — tap pads · FLIP below transport.'
          : 'Optional Circuit views — Pattern stays the playable grid.'}
      </p>

      <div className="cm-mode-row" role="tablist" aria-label="Sequencer mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`cm-mode-btn${mode === m.id ? ' on' : ''}`}
            title={m.blurb}
            onClick={() => pickMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'circuit-live' ? (
        <>
          <p className="callout seq-honesty" role="status">
            <strong>Live · experimental</strong> — watches Circuit in only (not editable).
          </p>
          {!circuitIn ? (
            <p className="callout warn-callout">Assign Circuit MIDI in on Setup.</p>
          ) : (
            <p className="muted small">Listening · press Play on the Circuit.</p>
          )}
          <p className="muted small">
            Want pads + FLIP?{' '}
            <button type="button" className="linklike" onClick={() => pickMode('splot-pattern')}>
              Open Pattern
            </button>
          </p>
          <div className="row cm-actions">
            <button type="button" className="ghost" onClick={() => a.getRuntime().resetCircuitMirror()}>
              Clear
            </button>
            <button type="button" className="ghost" onClick={downloadMirrorDiag}>
              Export JSON
            </button>
            {mirror.lastNote ? (
              <span className="mono small">
                last T{mirror.lastNote.track} · n{mirror.lastNote.note} (
                {noteName(mirror.lastNote.note)}) · v{mirror.lastNote.velocity}
              </span>
            ) : null}
            {intel.position.bar > 0 ? (
              <span className="mono small">
                bar {intel.position.bar}:{intel.position.beat}
                {intel.position.bpm != null ? ` · ≈${intel.position.bpm}` : ''}
              </span>
            ) : null}
          </div>
          <CircuitMirrorGrid
            snap={mirror}
            label="Live"
            readOnlyHint="Bright = steady · Dim = fading · Empty = silent. Guesses only — never auto-mute."
            intelligence={intel}
          />
          <details className="panel collapsed-chrome seq-intel-fold">
            <summary>
              <h2>Circuit details</h2>
            </summary>
            <CircuitIntelligencePanel intel={intel} />
          </details>
        </>
      ) : null}

      {mode === 'circuit-saved' ? (
        <>
          <p className="callout seq-honesty" role="status">
            <strong>Saved · experimental</strong> — local <code>.ncs</code> only (never auto USB).
          </p>
          <div className="row cm-actions">
            <label className="seq-btn">
              Open .ncs
              <input
                type="file"
                accept=".ncs,application/octet-stream"
                hidden
                onChange={(e) => void loadNcs(e.target.files?.[0] ?? null)}
              />
            </label>
            {ncsPatterns ? (
              <label className="seq-field">
                Slot
                <select
                  value={savedPatternIndex}
                  onChange={(e) => switchSavedPattern(Number(e.target.value))}
                >
                  {Array.from({ length: 8 }, (_, i) => (
                    <option key={i} value={i}>
                      Pattern {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {savedError ? <p className="warn">{savedError}</p> : null}
          {savedSummary ? <p className="muted small">{savedSummary}</p> : null}
          <CircuitMirrorGrid
            snap={savedSnap}
            label="Saved"
            readOnlyHint="First 16 steps of each track’s selected pattern from the file."
          />
        </>
      ) : null}

      {mode === 'splot-pattern' ? (
        <>
          <div className="seq-transport seq-transport-dominant" role="toolbar" aria-label="Sequencer transport">
            <button
              type="button"
              className={seq.playing ? 'seq-btn on' : 'seq-btn'}
              onClick={() => a.seqPlay()}
            >
              PLAY
            </button>
            <button type="button" className="seq-btn" onClick={() => a.seqStop()}>
              STOP
            </button>
            <button
              type="button"
              className={seq.recording ? 'seq-btn rec on' : 'seq-btn rec'}
              onClick={() => a.seqToggleRecord()}
            >
              RECORD
            </button>
            <label className="seq-field">
              BPM
              <input
                type="number"
                min={40}
                max={300}
                value={pattern.bpm}
                onChange={(e) => a.seqSetBpm(Number(e.target.value))}
              />
            </label>
            {snap.estimatedBpm != null ? (
              <span className="seq-meta muted small">≈ {snap.estimatedBpm}</span>
            ) : null}
            <label className="seq-field">
              PATTERN
              <select
                value={seq.bank.activePatternIndex}
                onChange={(e) => a.seqSetActivePattern(Number(e.target.value))}
              >
                {seq.bank.patterns.map((p, i) => (
                  <option key={p.id} value={i}>
                    {i + 1}. {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="seq-field">
              LENGTH
              <input
                type="number"
                min={1}
                max={16}
                value={pattern.length}
                onChange={(e) => a.seqSetLength(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="seq-btn"
              disabled={seq.undoCount < 1}
              onClick={() => a.seqUndo()}
            >
              UNDO
            </button>
            <button
              type="button"
              className="seq-btn ghost"
              disabled={seq.redoCount < 1}
              onClick={() => a.seqRedo()}
            >
              REDO
            </button>
            <label className="seq-field">
              CLOCK
              <select
                value={seq.bank.clockSource}
                onChange={(e) =>
                  a.seqSetClockSource(e.target.value === 'internal' ? 'internal' : 'circuit')
                }
              >
                <option value="circuit">Circuit (default)</option>
                <option value="internal">Internal BPM</option>
              </select>
            </label>
            <a className="seq-flip-jump" href="#flip-lane">
              FLIP ↓
            </a>
          </div>

          {/* Pass D: FLIP above the fold — not buried under the full grid */}
          <FlipLane
            bpm={pattern.bpm}
            playhead={seq.playhead}
            playing={seq.playing}
            clockSource={seq.bank.clockSource}
            trackMutes={pattern.tracks.map((t) => t.muted)}
            setTrackMute={(track, muted) => a.seqSetTrackMute(track, muted)}
          />

          <div className="seq-grid-wrap">
            <div className="seq-grid-label">
              Pattern · T{selected.track}
              {selStep ? ` · step ${selected.step + 1}` : ''}
            </div>
            <div className="seq-step-nums" aria-hidden="true">
              <span className="seq-track-gutter" />
              {Array.from({ length: 16 }, (_, i) => (
                <span
                  key={i}
                  className={`seq-step-num${i >= pattern.length ? ' dim' : ''}${seq.playhead === i ? ' play' : ''}`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <div className="seq-grid" role="grid" aria-label="8 by 16 step pads">
              {pattern.tracks.map((track, ti) => {
                const trackNo = ti + 1;
                const dest = snap.controller.tracks[ti]?.dest ?? null;
                return (
                  <div key={trackNo} className="seq-row" role="row">
                    <div className="seq-track-meta">
                      <b>T{trackNo}</b>
                      <span className={`seq-dest ${dest ? `dev-${dest.device}` : 'dev-off'}`}>
                        {destBadge(dest)}
                      </span>
                      <button
                        type="button"
                        className={track.muted ? 'seq-ms on' : 'seq-ms'}
                        aria-pressed={track.muted}
                        onClick={() => a.seqSetTrackMute(trackNo, !track.muted)}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        className={track.solo ? 'seq-ms solo on' : 'seq-ms solo'}
                        aria-pressed={track.solo}
                        onClick={() => a.seqSetTrackSolo(trackNo, !track.solo)}
                      >
                        S
                      </button>
                    </div>
                    <div className="seq-pads">
                      {track.steps.map((st, si) => {
                        const outside = si >= pattern.length;
                        const selectedCell =
                          selected.track === trackNo && selected.step === si;
                        const playing = seq.playhead === si && seq.playing;
                        return (
                          <button
                            key={si}
                            type="button"
                            role="gridcell"
                            aria-label={`Track ${trackNo} step ${si + 1}${st.on ? ' on' : ' off'}`}
                            className={[
                              'seq-pad',
                              st.on ? 'lit' : '',
                              outside ? 'outside' : '',
                              selectedCell ? 'selected' : '',
                              playing ? 'playhead' : '',
                              dest ? `dev-${dest.device}` : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            style={
                              st.on
                                ? {
                                    opacity: 0.35 + (st.velocity / 127) * 0.65,
                                  }
                                : undefined
                            }
                            onClick={() => a.seqClickToggle(trackNo, si)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              a.seqSelectCell(trackNo, si);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selStep ? (
            <div className="panel seq-edit">
              <h2>
                Step T{selected.track}.{selected.step + 1}
              </h2>
              <div className="seq-edit-row">
                <label>
                  Pitch
                  <input
                    type="number"
                    min={0}
                    max={127}
                    value={selStep.pitch}
                    onChange={(e) =>
                      a.seqSetStep(selected.track, selected.step, {
                        pitch: Number(e.target.value),
                        on: true,
                      })
                    }
                  />
                  <span className="muted small">{noteName(selStep.pitch)}</span>
                </label>
                <label>
                  Velocity
                  <input
                    type="range"
                    min={1}
                    max={127}
                    value={selStep.velocity}
                    onChange={(e) =>
                      a.seqSetStep(selected.track, selected.step, {
                        velocity: Number(e.target.value),
                        on: true,
                      })
                    }
                  />
                  <span className="mono">{selStep.velocity}</span>
                </label>
                <label>
                  Gate
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={Math.round(selStep.gate * 100)}
                    onChange={(e) =>
                      a.seqSetStep(selected.track, selected.step, {
                        gate: Number(e.target.value) / 100,
                        on: true,
                      })
                    }
                  />
                  <span className="mono">{Math.round(selStep.gate * 100)}%</span>
                </label>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <MoreInfo label="Live / Saved limits">
        <p className="small muted">
          Live watches USB performance MIDI (notes + clock). Unsaved pattern RAM is not exposed over
          MIDI. Saved reads local <code>.ncs</code> only. Status: <b>experimental</b> until confirmed
          on hardware.
        </p>
      </MoreInfo>
    </div>
  );
}
