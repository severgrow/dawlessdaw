import { destBadge } from '@dawlessdaw/devices';
import { MoreInfo } from '../components/MoreInfo';
import { FlipLane } from '../flip/FlipLane';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

/**
 * Circuit-inspired 8×16 pad grid. Patterns are Dawlessdaw-owned — this does not
 * display Circuit's internal stored patterns.
 */
export function SequencerWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const seq = snap.sequencer;
  const pattern = seq.bank.patterns[seq.bank.activePatternIndex]!;
  const selected = snap.sequencerSelected;
  const selStep = pattern.tracks[selected.track - 1]?.steps[selected.step];
  const circuitIn = snap.assignments.find((x) => x.roleId === 'circuit')?.inputPortId;

  return (
    <div className="section-enter seq-page">
      <div className="page-head">
        <h1>sequencer</h1>
        <span className="seq-brand-chip" title="Product brand">
          Splot MIDI Brain
        </span>
      </div>
      <p className="lead">
        Dawlessdaw Pattern — 8 tracks × 16 steps. Routes through Controller destinations.
      </p>

      <p className="callout seq-honesty" role="status">
        <strong>Circuit Pattern Unavailable</strong> — this grid is not Circuit&apos;s internal
        project. Optional <b>Live MIDI Activity</b> below only shows notes observed over USB.
      </p>

      {!circuitIn ? (
        <p className="callout warn-callout">
          Assign Circuit input in Setup — sequencer notes reuse Controller routes from that port.
        </p>
      ) : null}

      <div className="seq-transport" role="toolbar" aria-label="Sequencer transport">
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
          <span className="seq-meta muted small">Circuit ≈ {snap.estimatedBpm}</span>
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
      </div>

      <div className="seq-grid-wrap">
        <div className="seq-grid-label">Dawlessdaw Pattern</div>
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

      <FlipLane
        bpm={pattern.bpm}
        playhead={seq.playhead}
        playing={seq.playing}
        clockSource={seq.bank.clockSource}
        trackMutes={pattern.tracks.map((t) => t.muted)}
        setTrackMute={(track, muted) => a.seqSetTrackMute(track, muted)}
      />

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
            <label>
              Track default pitch
              <input
                type="number"
                min={0}
                max={127}
                value={pattern.tracks[selected.track - 1]!.defaultPitch}
                onChange={(e) =>
                  a.seqSetTrackDefaults(selected.track, {
                    defaultPitch: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h2>Live MIDI Activity</h2>
        <p className="muted small">
          Observed Circuit notes on tracks 1–8 (USB). Not a dump of Circuit&apos;s stored pattern.
        </p>
        {seq.liveActivity ? (
          <p className="seq-live mono">
            T{seq.liveActivity.track} · n{seq.liveActivity.note} ({noteName(seq.liveActivity.note)}) ·
            v{seq.liveActivity.velocity}
          </p>
        ) : (
          <p className="muted small">No Circuit notes heard yet.</p>
        )}
      </div>

      <MoreInfo label="Timing limits">
        <p className="small muted">
          Scheduling uses <code>performance.now()</code> and Web MIDI output timestamps on the
          browser main thread — not sample-accurate. Prefer Circuit as clock master (DIN thru for
          tight sync). Internal BPM never emits MIDI clock, so it cannot become a second competing
          clock. Circuit Pattern Unavailable: Novation does not expose stored pattern dumps over
          stock MIDI for this app to display.
        </p>
      </MoreInfo>
    </div>
  );
}
