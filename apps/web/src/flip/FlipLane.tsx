/**
 * FLIP lane UI — stereo mix capture under the 8 MIDI tracks.
 * Workflow: Input → PLAY Circuit/seq → ARM → capture → PLAY LOOP.
 * Optional: mute Dawlessdaw Pattern tracks while the loop plays (not Circuit mute / not stems).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MoreInfo } from '../components/MoreInfo';
import {
  formatInputLabel,
  listAudioInputs,
  loadPersistedInputId,
} from '../recorder/devices';
import { stereoPeaks } from '../recorder/pcmMath';
import { loadTakeAudio } from '../recorder/takeStore';
import type { AudioInputDevice, StereoAudio } from '../recorder/types';
import { PLAYBACK_REENGAGE_WARN } from './feedback';
import { downloadFlipWav, exportChopWavs } from './exportFlip';
import { FlipInputPreview } from './FlipInputPreview';
import { getFlipEngine, type FlipEngineStatus } from './flipEngine';
import {
  FLIP_HANDOFF_TRACKS,
  HANDOFF_LIMITS,
  toggleHandoffTrack,
  type FlipHandoffTrack,
} from './handoff';
import { FLIP_BAR_OPTIONS, type FlipBarCount } from './types';

export interface FlipLaneProps {
  bpm: number;
  playhead: number;
  playing: boolean;
  clockSource: 'circuit' | 'internal';
  /** Current Dawlessdaw Pattern mute flags (index 0 = track 1). */
  trackMutes?: boolean[];
  setTrackMute?: (track: number, muted: boolean) => void;
}

export function FlipLane({
  bpm,
  playhead,
  playing,
  clockSource,
  trackMutes,
  setTrackMute,
}: FlipLaneProps) {
  const [status, setStatus] = useState<FlipEngineStatus>(() => getFlipEngine().status());
  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  const [audio, setAudio] = useState<StereoAudio | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [wavBits, setWavBits] = useState<16 | 24>(24);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const mutesRef = useRef(trackMutes);
  mutesRef.current = trackMutes;
  const setMuteRef = useRef(setTrackMute);
  setMuteRef.current = setTrackMute;

  useEffect(() => getFlipEngine().subscribe(setStatus), []);

  useEffect(() => {
    getFlipEngine().updateClock({ playing, playhead, bpm, clockSource });
  }, [playing, playhead, bpm, clockSource]);

  const hasMuteHook = typeof setTrackMute === 'function';
  useEffect(() => {
    if (!hasMuteHook) {
      getFlipEngine().setHandoffHooks(null);
      return;
    }
    getFlipEngine().setHandoffHooks({
      getMuted: (track) => mutesRef.current?.[track - 1] === true,
      setMute: (track, muted) => setMuteRef.current?.(track, muted),
    });
    return () => getFlipEngine().setHandoffHooks(null);
  }, [hasMuteHook]);

  useEffect(() => {
    void (async () => {
      const list = await listAudioInputs();
      setInputs(list);
      const eng = getFlipEngine();
      const saved = eng.status().deviceId ?? loadPersistedInputId();
      const pick = (saved && list.find((d) => d.deviceId === saved)) || list[0] || null;
      if (pick) eng.setInput(pick.deviceId, formatInputLabel(pick));
    })();
  }, []);

  useEffect(() => {
    const clip = status.activeClip;
    if (!clip || status.phase !== 'ready') {
      setAudio(null);
      return;
    }
    let cancelled = false;
    void loadTakeAudio(clip.takeId).then((a) => {
      if (!cancelled) setAudio(a);
    });
    return () => {
      cancelled = true;
    };
  }, [status.activeClip?.takeId, status.phase]);

  useEffect(() => {
    const canvas = waveRef.current;
    const clip = status.activeClip;
    if (!canvas || !audio || !clip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#9a2a45';
    const mint = css.getPropertyValue('--alert-hi').trim() || '#b5ead3';
    const dim = css.getPropertyValue('--line-hard').trim() || '#3a3a3a';
    const bone = css.getPropertyValue('--bone').trim() || '#e8e1d2';
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);
    const peaks = stereoPeaks(audio, w);
    const mid = h / 2;
    peaks.forEach((p, x) => {
      const inTrim =
        x / w >= clip.trim.startFrame / audio.left.length &&
        x / w < clip.trim.endFrame / audio.left.length;
      ctx.strokeStyle = inTrim ? accent : dim;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid - p * mid);
      ctx.lineTo(x + 0.5, mid + p * mid);
      ctx.stroke();
    });
    const x0 = (clip.trim.startFrame / audio.left.length) * w;
    const x1 = (clip.trim.endFrame / audio.left.length) * w;
    ctx.fillStyle = mint;
    ctx.fillRect(x0 - 1, 0, 2, h);
    ctx.fillRect(x1 - 1, 0, 2, h);
    if (clip.chop) {
      ctx.strokeStyle = bone;
      ctx.globalAlpha = 0.35;
      for (let i = 1; i < clip.chop.slices; i++) {
        const t =
          clip.trim.startFrame +
          ((clip.trim.endFrame - clip.trim.startFrame) * i) / clip.chop.slices;
        const x = (t / audio.left.length) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }, [audio, status.activeClip]);

  const onInput = useCallback(
    (deviceId: string) => {
      const d = inputs.find((x) => x.deviceId === deviceId);
      if (!d) return;
      getFlipEngine().setInput(d.deviceId, formatInputLabel(d));
    },
    [inputs],
  );

  const onTrimDrag = useCallback(
    (which: 'start' | 'end', clientX: number) => {
      const canvas = waveRef.current;
      const clip = status.activeClip;
      if (!canvas || !audio || !clip) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const frame = Math.round(ratio * audio.left.length);
      if (which === 'start') getFlipEngine().setTrim(frame, clip.trim.endFrame);
      else getFlipEngine().setTrim(clip.trim.startFrame, frame);
    },
    [audio, status.activeClip],
  );

  const clip = status.activeClip;
  const phaseRec =
    status.phase === 'recording' ||
    status.phase === 'waiting_boundary' ||
    status.phase === 'armed' ||
    status.phase === 'processing';
  const ready = clip && status.phase === 'ready';
  const handoff = status.handoff;

  return (
    <section className="flip-lane" aria-label="FLIP capture lane">
      <div className="flip-lane-head">
        <div className="flip-title-row">
          <h2 className="flip-title">FLIP</h2>
          <span className="flip-brand muted small">dawless/daw MIDI Brain</span>
          <span className={`flip-phase flip-phase-${status.phase}`}>{status.phaseLabel}</span>
        </div>
        <p className="flip-lead muted small">
          Captures the <b>stereo audio mix</b> from your interface — not a MIDI track, not stem
          isolation. Circuit USB audio is unused; feed Scarlett / ZED / MPC / SP / FM1 into the
          selected input.
        </p>
        <ol className="flip-steps" aria-label="FLIP workflow">
          <li>Input</li>
          <li>PLAY seq</li>
          <li>ARM</li>
          <li>PLAY LOOP</li>
        </ol>
      </div>

      <div className="flip-controls" role="toolbar" aria-label="FLIP capture">
        <label className="seq-field">
          Input
          <select
            value={status.deviceId ?? ''}
            onChange={(e) => onInput(e.target.value)}
            disabled={phaseRec}
          >
            {inputs.length === 0 ? (
              <option value="">No inputs — allow mic</option>
            ) : (
              inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {formatInputLabel(d)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="seq-field">
          Bars
          <select
            value={status.bars}
            disabled={phaseRec}
            onChange={(e) => getFlipEngine().setBars(Number(e.target.value) as FlipBarCount)}
          >
            {FLIP_BAR_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={
            status.phase === 'armed' || status.phase === 'waiting_boundary'
              ? 'seq-btn rec on'
              : ready
                ? 'seq-btn'
                : 'seq-btn rec'
          }
          disabled={status.phase === 'recording' || status.phase === 'processing'}
          onClick={() => {
            if (status.phase === 'armed' || status.phase === 'waiting_boundary') {
              getFlipEngine().disarm();
              setMsg(null);
            } else {
              getFlipEngine().armQuantised();
              setMsg(
                playing
                  ? 'Waiting for next bar boundary…'
                  : 'Press sequencer PLAY, then wait for the bar — or use Capture now (Advanced).',
              );
            }
          }}
        >
          {status.phase === 'waiting_boundary'
            ? 'WAITING'
            : status.phase === 'armed'
              ? 'ARMED'
              : 'ARM'}
        </button>

        {phaseRec ? (
          <button
            type="button"
            className="seq-btn ghost"
            onClick={() => void getFlipEngine().cancel()}
          >
            CANCEL
          </button>
        ) : null}

        {ready ? (
          <button
            type="button"
            className={status.loopPlaying ? 'seq-btn on' : 'seq-btn rec'}
            onClick={() => {
              if (status.loopPlaying) {
                getFlipEngine().stopPlayback();
                setMsg(
                  status.handoffActive
                    ? 'Stopped — Dawlessdaw track mutes restored'
                    : 'Stopped',
                );
              } else {
                void getFlipEngine().playLoop().then(() => {
                  const s = getFlipEngine().status();
                  setMsg(
                    s.handoff.replaceMidiWhilePlaying
                      ? `Playing loop — muted Dawlessdaw T${s.handoff.tracks.join(',')}`
                      : 'Playing loop',
                  );
                });
              }
            }}
          >
            {status.loopPlaying ? 'STOP LOOP' : 'PLAY LOOP'}
          </button>
        ) : null}
      </div>

      <FlipInputPreview
        deviceId={status.deviceId}
        enabled={status.phase !== 'processing'}
        captureMeters={
          status.phase === 'recording' ? status.capture.meters : null
        }
      />

      {status.phase === 'recording' ? (
        <p className="flip-progress mono small" role="status">
          Recording…{' '}
          {Math.min(
            100,
            Math.round((status.elapsedCaptureMs / Math.max(1, status.targetCaptureMs)) * 100),
          )}
          %
          <span className="muted">
            {' '}
            · {status.bars} bar · {bpm} BPM
          </span>
        </p>
      ) : null}

      {status.feedbackWarn ? (
        <p className="callout warn-callout flip-warn" role="alert">
          {status.feedbackWarn}
        </p>
      ) : null}

      {status.error ? (
        <p className="callout warn-callout" role="alert">
          {status.error}
        </p>
      ) : null}

      {msg ? <p className="muted small">{msg}</p> : null}

      {ready && clip ? (
        <div className="flip-ready">
          <canvas
            ref={waveRef}
            className="flip-wave"
            width={900}
            height={72}
            aria-label="FLIP waveform"
            onMouseDown={(e) => {
              const canvas = waveRef.current;
              if (!canvas || !clip) return;
              const rect = canvas.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const mid =
                (clip.trim.startFrame + clip.trim.endFrame) / 2 / (audio?.left.length || 1);
              const which = ratio < mid ? 'start' : 'end';
              onTrimDrag(which, e.clientX);
              const move = (ev: MouseEvent) => onTrimDrag(which, ev.clientX);
              const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
          />

          <div className="flip-handoff" role="group" aria-label="Replace MIDI tracks">
            <label className="flip-check">
              <input
                type="checkbox"
                checked={handoff.replaceMidiWhilePlaying}
                onChange={(e) =>
                  getFlipEngine().setReplaceMidiWhilePlaying(e.target.checked)
                }
              />
              Replace MIDI tracks while FLIP plays
            </label>
            {handoff.replaceMidiWhilePlaying ? (
              <div className="flip-handoff-tracks">
                {FLIP_HANDOFF_TRACKS.map((t) => (
                  <label key={t} className="flip-check flip-track-chip">
                    <input
                      type="checkbox"
                      checked={handoff.tracks.includes(t)}
                      onChange={() => {
                        const next = toggleHandoffTrack(
                          handoff.tracks as FlipHandoffTrack[],
                          t,
                        );
                        getFlipEngine().setHandoffTracks(next);
                      }}
                    />
                    T{t}
                  </label>
                ))}
                {status.handoffActive ? (
                  <button
                    type="button"
                    className="seq-btn ghost"
                    onClick={() => {
                      getFlipEngine().undoHandoffMutes();
                      setMsg('Handoff mutes undone — previous mute state restored');
                    }}
                  >
                    UNDO MUTES
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="muted small flip-handoff-note">{HANDOFF_LIMITS}</p>
          </div>

          <div className="flip-play-row">
            <label className="seq-field">
              Gain
              <input
                type="range"
                min={0}
                max={200}
                value={Math.round(clip.gain * 100)}
                onChange={(e) => getFlipEngine().setGain(Number(e.target.value) / 100)}
              />
            </label>
            <button
              type="button"
              className="seq-btn ghost"
              disabled={status.undoCount < 1}
              onClick={() => getFlipEngine().undo()}
            >
              UNDO EDIT
            </button>
            <button
              type="button"
              className="seq-btn ghost"
              onClick={() => {
                getFlipEngine().clear();
                setAudio(null);
                setMsg(null);
              }}
            >
              CLEAR
            </button>
          </div>

          <div className="flip-chop-row">
            <span className="muted small">CHOP</span>
            {([4, 8, 16] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={clip.chop?.slices === n ? 'seq-btn on' : 'seq-btn'}
                onClick={() => getFlipEngine().setChop(clip.chop?.slices === n ? null : n)}
              >
                {n}
              </button>
            ))}
            {clip.sliceSeq ? (
              <div className="flip-slice-seq" role="grid" aria-label="FLIP slice sequencer">
                {clip.sliceSeq.steps.slice(0, clip.sliceSeq.length).map((st, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`flip-slice-pad${st.slice >= 0 ? ' lit' : ''}`}
                    title={st.slice >= 0 ? `Slice ${st.slice + 1}` : 'Empty'}
                    onClick={() => {
                      const max = clip.chop?.slices ?? 8;
                      const next = st.slice < 0 ? 0 : (st.slice + 1) % max;
                      const clear = st.slice === max - 1;
                      getFlipEngine().setSliceStep(i, clear ? -1 : next);
                    }}
                  >
                    {st.slice >= 0 ? st.slice + 1 : '·'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="flip-more-toggle"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? 'Hide advanced' : 'More / Advanced'}
      </button>

      {showAdvanced ? (
        <div className="flip-advanced">
          <div className="flip-controls" role="toolbar" aria-label="FLIP advanced">
            <label className="seq-field" title="Non-destructive trim offset per input">
              Offset ms
              <input
                type="number"
                min={-500}
                max={500}
                step={1}
                value={status.captureOffsetMs}
                disabled={phaseRec}
                onChange={(e) => getFlipEngine().setCaptureOffsetMs(Number(e.target.value), true)}
              />
            </label>
            <button
              type="button"
              className="seq-btn"
              disabled={
                status.phase === 'recording' ||
                status.phase === 'processing' ||
                status.phase === 'waiting_boundary'
              }
              onClick={() => {
                void (async () => {
                  if (status.phase !== 'armed') getFlipEngine().armQuantised();
                  await getFlipEngine().captureNow();
                  setMsg('Unaligned capture — no time-stretch');
                })();
              }}
            >
              CAPTURE NOW
            </button>
            <label className="flip-check">
              <input
                type="checkbox"
                checked={status.monitorInput}
                onChange={(e) => getFlipEngine().setMonitorInput(e.target.checked)}
              />
              Monitor
            </label>
            <label className="flip-check" title="Intentional resample — feedback risk">
              <input
                type="checkbox"
                checked={status.allowPlayWhileRec}
                onChange={(e) => getFlipEngine().setAllowPlayWhileRec(e.target.checked)}
              />
              Intentional resample
            </label>
          </div>

          {!status.monitorInput ? (
            <p className="muted small flip-hint">
              Monitor OFF (safe default). {PLAYBACK_REENGAGE_WARN}
            </p>
          ) : null}

          {ready && clip ? (
            <>
              <div className="flip-align" role="status">
                <span className={`flip-badge align-${clip.alignment}`}>{clip.alignment}</span>
                <span className={`flip-badge conf-${clip.confidence}`}>
                  confidence {clip.confidence}
                </span>
                <span className="muted small">{clip.confidenceNote}</span>
              </div>
              <div className="flip-play-row">
                <label className="flip-check">
                  <input
                    type="checkbox"
                    checked={clip.reverse}
                    onChange={(e) => getFlipEngine().setReverse(e.target.checked)}
                  />
                  Reverse
                </label>
                <label className="seq-field">
                  Fade in ms
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={clip.fadeInMs}
                    onChange={(e) =>
                      getFlipEngine().setFades(Number(e.target.value), clip.fadeOutMs)
                    }
                  />
                </label>
                <label className="seq-field">
                  Fade out ms
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={clip.fadeOutMs}
                    onChange={(e) =>
                      getFlipEngine().setFades(clip.fadeInMs, Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <div className="flip-export-row">
                <label className="seq-field">
                  WAV
                  <select
                    value={wavBits}
                    onChange={(e) => setWavBits(Number(e.target.value) as 16 | 24)}
                  >
                    <option value={24}>24-bit</option>
                    <option value={16}>16-bit</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="seq-btn"
                  disabled={busy || !audio}
                  onClick={() => {
                    if (!audio || !clip) return;
                    setBusy(true);
                    void downloadFlipWav(audio, clip, { wavBitDepth: wavBits })
                      .then((name) => setMsg(`Exported ${name}`))
                      .finally(() => setBusy(false));
                  }}
                >
                  EXPORT WAV
                </button>
                <button
                  type="button"
                  className="seq-btn ghost"
                  disabled={busy || !audio || !clip.chop}
                  onClick={() => {
                    if (!audio || !clip?.chop) return;
                    setBusy(true);
                    void exportChopWavs(audio, clip, wavBits)
                      .then((names) => setMsg(`Exported ${names.length} slices`))
                      .finally(() => setBusy(false));
                  }}
                >
                  EXPORT SLICES
                </button>
              </div>
            </>
          ) : null}

          <MoreInfo label="What FLIP does / does not do">
            <p className="muted small">
              FLIP records whatever arrives on the chosen audio input for N bars, then loops that
              clip in the browser. It does <b>not</b> convert a MIDI track into audio by itself —
              hardware must be audible on that input. Phase C Circuit mute / stem APIs are not
              claimed. Optional &quot;Replace MIDI tracks&quot; only mutes Dawlessdaw Pattern
              tracks while PLAY LOOP runs (undo restores).
            </p>
          </MoreInfo>
        </div>
      ) : null}
    </section>
  );
}
