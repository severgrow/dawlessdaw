import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { destBadge, parseNcsSession, summarizeSession } from '@dawlessdaw/devices';
import {
  SCALES,
  cellsFromNcsPattern,
  MIRROR_STEP_COUNT,
  MIRROR_TRACK_COUNT,
  NOTE_NAMES,
  patternFromObservation,
  observationFromMirror,
  type CircuitMirrorSnapshot,
  type MirrorCell,
  type ScaleId,
  type SequencerViewMode,
} from '@dawlessdaw/sequencer';
import { CircuitIntelligencePanel } from '../components/CircuitIntelligencePanel';
import { CircuitPatternCapture } from '../components/CircuitPatternCapture';
import { CircuitMirrorGrid } from '../components/CircuitMirrorGrid';
import { EuclideanControls } from '../components/EuclideanControls';
import { HardwareControlPanel } from '../components/HardwareControlPanel';
import { MoreInfo } from '../components/MoreInfo';
import { FlipLane } from '../flip/FlipLane';
import { carrySetupRole } from '../nav/uiSelection';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

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
  const circuitRole = snap.assignments.find((x) => x.roleId === 'circuit');
  const circuitIn = snap.ports.find((port) =>
    port.id === circuitRole?.inputPortId && port.state === 'connected',
  )?.id;
  const circuitOut = circuitRole?.outputPortId;
  const seq = snap.sequencer;
  const pattern = seq.bank.patterns[seq.bank.activePatternIndex]!;
  const selected = snap.sequencerSelected;
  const selStep = pattern.tracks[selected.track - 1]?.steps[selected.step];
  const gen = snap.generative;
  const genSettings = gen.settings;
  const auditionSide = snap.patternAudition;
  const hearingOriginal = auditionSide === 'A';
  const locked =
    gen.locks[selected.track - 1]?.[selected.step] === true;

  const [mode, setMode] = useState<SequencerViewMode>(() => {
    const pref = loadModePref();
    if (pref) return pref;
    // Pass D: playable Pattern by default (no Circuit jargon wall).
    return 'splot-pattern';
  });
  const pickMode = (m: SequencerViewMode) => {
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
      <div className="page-head seq-workspace-head">
        <h1>{pageTitle}</h1>
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
            <button
              type="button"
              className="seq-btn"
              onClick={() => {
                a.genCaptureFromMirror();
                pickMode('splot-pattern');
              }}
            >
              Use as source
            </button>
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
          {savedTracks ? (
            <div className="row cm-actions">
              <button
                type="button"
                className="seq-btn"
                onClick={() => {
                  const grid = observationFromMirror(savedSnap);
                  const pat = patternFromObservation(grid, {
                    name: `Saved .ncs P${savedPatternIndex + 1}`,
                    bpm: pattern.bpm,
                  });
                  a.getRuntime().genCapturePattern(pat, 'ncs');
                  pickMode('splot-pattern');
                }}
              >
                Use as source
              </button>
            </div>
          ) : null}
          <CircuitMirrorGrid
            snap={savedSnap}
            label="Saved"
            readOnlyHint="First 16 steps of each track’s selected pattern from the file — not live RAM."
          />
        </>
      ) : null}

      {mode === 'splot-pattern' ? (
        <>
          <div className="seq-transport seq-transport-dominant" role="toolbar" aria-label="Sequencer transport">
            <button
              type="button"
              className={seq.playing ? 'seq-btn on' : 'seq-btn'}
              aria-pressed={seq.playing}
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
              aria-pressed={seq.recording}
              disabled={hearingOriginal}
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
            <button
              type="button"
              className={snap.hearOnCircuit ? 'seq-btn on' : 'seq-btn ghost'}
              title={
                circuitOut
                  ? 'Opt-in Note Rx audition on Circuit Out — experimental'
                  : 'Assign Circuit Out on Setup first'
              }
              disabled={!circuitOut}
              onClick={() => a.setHearOnCircuit(!snap.hearOnCircuit)}
            >
              HEAR CIRCUIT
            </button>
            <a className="seq-flip-jump" href="#flip-lane">
              FLIP ↓
            </a>
          </div>

          <section className="pattern-workflow" aria-label="Capture and vary a pattern">
            <CircuitPatternCapture
              key={seq.bank.activePatternIndex}
              inputPort={circuitIn}
              openSetup={() => {
                carrySetupRole('circuit', 'Ports · Circuit Rhythm');
                a.setWorkspace('setup');
              }}
              capture={(bars) => a.getRuntime().captureCircuitPattern(bars)}
              usePattern={(captured) => a.getRuntime().genCapturePattern(captured, 'capture')}
            />
            <div className="pattern-variation">
              <h2 className="pattern-group-title">Audition & vary</h2>
              <div className="pattern-controls">
                <div className="pattern-audition" role="group" aria-label="Audition pattern">
                  <button
                    type="button"
                    className={hearingOriginal ? 'seq-btn on' : 'seq-btn'}
                    aria-pressed={hearingOriginal}
                    disabled={!gen.hasSource}
                    title={gen.source?.name}
                    onClick={() => a.getRuntime().setPatternAudition('A')}
                  >
                    A · Original
                  </button>
                  <button
                    type="button"
                    className={hearingOriginal ? 'seq-btn' : 'seq-btn on'}
                    aria-pressed={!hearingOriginal}
                    onClick={() => a.getRuntime().setPatternAudition('B')}
                  >
                    B · Variation
                  </button>
                </div>
                <button type="button" className="seq-btn pattern-primary" onClick={a.genMutate}>
                  Mutate
                </button>
                <button type="button" className="seq-btn" onClick={a.genGenerate}>
                  Generate
                </button>
                <button type="button" className="seq-btn ghost" disabled={!seq.undoCount} onClick={a.seqUndo}>
                  Undo
                </button>
                <button type="button" className="seq-btn ghost" disabled={!seq.redoCount} onClick={a.seqRedo}>
                  Redo
                </button>
              </div>
              <p className="pattern-feedback small muted" aria-live="polite">
                {seq.playing ? 'Playing' : 'Ready to play'} {auditionSide} · Editing B
                {gen.hasSource ? ' · Switching stops playback. Press Play to hear your selection.' : ''}
              </p>
            </div>
            <div className="pattern-settings-row">
              <details className="pattern-settings">
                <summary>Generator settings</summary>
                <div className="gen-strip">
                  <label className="seq-field">
                    Root
                    <select
                      value={genSettings.root}
                      onChange={(e) => a.genSetSettings({ root: Number(e.target.value) })}
                    >
                      {NOTE_NAMES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="seq-field">
                    Scale
                    <select
                      value={genSettings.scaleId}
                      onChange={(e) => a.genSetSettings({ scaleId: e.target.value as ScaleId })}
                    >
                      {SCALES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="seq-field gen-range">
                    Density
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(genSettings.density * 100)}
                      onChange={(e) => a.genSetSettings({ density: Number(e.target.value) / 100 })}
                    />
                    <span className="mono small">{Math.round(genSettings.density * 100)}</span>
                  </label>
                  <label className="seq-field gen-range">
                    Mutate
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(genSettings.mutation * 100)}
                      onChange={(e) => a.genSetSettings({ mutation: Number(e.target.value) / 100 })}
                    />
                    <span className="mono small">{Math.round(genSettings.mutation * 100)}</span>
                  </label>
                  <label className="seq-field">
                    Seed
                    <input
                      type="number"
                      min={0}
                      value={genSettings.seed}
                      onChange={(e) => a.genSetSettings({ seed: Number(e.target.value) >>> 0 })}
                    />
                  </label>
                  <button type="button" className="seq-btn" onClick={a.genCaptureFromPattern}>
                    Set grid as A
                  </button>
                  <button type="button" className="seq-btn ghost" disabled={!gen.hasSource} onClick={a.genResetToSource}>
                    Reset B from A
                  </button>
                </div>
              </details>
              <EuclideanControls length={pattern.length} apply={(settings) => a.getRuntime().genApplyEuclidean(settings)} />
            </div>
          </section>

          <div className="seq-grid-wrap">
            <div className="seq-grid-label">
              Variation B · T{selected.track}
              {selStep ? ` · step ${selected.step + 1}` : ''}
            </div>
            <div className="seq-grid-scroll">
              <div className="seq-step-nums" aria-hidden="true">
                <span className="seq-track-gutter" />
                {Array.from({ length: 16 }, (_, i) => (
                  <span
                    key={i}
                    className={`seq-step-num${i % 4 === 0 ? ' beat' : ''}${i >= pattern.length ? ' dim' : ''}${!hearingOriginal && seq.playhead === i ? ' play' : ''}`}
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
                          title={`Mute track ${trackNo}`}
                          aria-label={`Mute track ${trackNo}`}
                          aria-pressed={track.muted}
                          onClick={() => a.seqSetTrackMute(trackNo, !track.muted)}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          className={track.solo ? 'seq-ms solo on' : 'seq-ms solo'}
                          title={`Solo track ${trackNo}`}
                          aria-label={`Solo track ${trackNo}`}
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
                          const playing = !hearingOriginal && seq.playhead === si && seq.playing;
                          const isLocked = gen.locks[ti]?.[si] === true;
                          return (
                            <button
                              key={si}
                              type="button"
                              role="gridcell"
                              aria-selected={selectedCell}
                              title={st.on ? `${noteName(st.pitch)} · velocity ${st.velocity} · gate ${Math.round(st.gate * 100)}%` : undefined}
                              aria-label={`Track ${trackNo} step ${si + 1}${st.on ? ' on' : ' off'}${isLocked ? ' locked' : ''}`}
                              className={[
                                'seq-pad',
                                st.on ? 'lit' : '',
                                outside ? 'outside' : '',
                                selectedCell ? 'selected' : '',
                                playing ? 'playhead' : '',
                                isLocked ? 'locked' : '',
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
                                a.genToggleLock(trackNo, si);
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
          </div>

          {selStep ? (
            <div className="panel seq-edit">
              <h2>
                Step T{selected.track}.{selected.step + 1}
              </h2>
              <div className="seq-edit-row">
                <button
                  type="button"
                  className={locked ? 'seq-btn on' : 'seq-btn ghost'}
                  aria-pressed={locked}
                  onClick={() => a.genToggleLock(selected.track, selected.step)}
                >
                  {locked ? 'Locked' : 'Lock'}
                </button>
                <label>
                  Pitch
                  <input
                    type="number"
                    min={0}
                    max={127}
                    value={selStep.pitch}
                    onChange={(e) =>
                      a.genEditStep(selected.track, selected.step, {
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
                      a.genEditStep(selected.track, selected.step, {
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
                      a.genEditStep(selected.track, selected.step, {
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
          <HardwareControlPanel />
          <FlipLane
            bpm={pattern.bpm}
            playhead={seq.playhead}
            playing={seq.playing}
            clockSource={seq.bank.clockSource}
            trackMutes={pattern.tracks.map((t) => t.muted)}
            setTrackMute={(track, muted) => a.seqSetTrackMute(track, muted)}
          />
        </>
      ) : null}

      <MoreInfo label="Circuit MIDI limits">
        <p className="small muted">
          Capture uses Circuit MIDI input on channels 1–8. Live shows observed and inferred activity.
          Both depend on what Circuit sends. Hear Circuit auditions notes on Circuit MIDI Out.
          Hardware verification is pending.
        </p>
      </MoreInfo>
    </div>
  );
}
