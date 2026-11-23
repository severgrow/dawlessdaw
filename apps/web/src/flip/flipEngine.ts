/**
 * FLIP orchestrator — reuses Session Recorder CaptureEngine (AudioWorklet PCM /
 * IndexedDB / WAV). Quantised bar capture against sequencer transport.
 */
import { getCaptureEngine, type CaptureStatus } from '../recorder/captureEngine';
import { getInputPreviewEngine } from '../recorder/inputPreview';
import { getPerformanceMemory } from '../recorder/performanceMemory';
import { loadTakeAudio, type TakeMeta } from '../recorder/takeStore';
import type { StereoAudio } from '../recorder/types';
import {
  armWaiting,
  initialFlipMachine,
  phaseLabel,
  transition,
  type FlipMachineState,
} from './stateMachine';
import {
  assessAlignment,
  buildTrimFromCapture,
  expectedContentFrames,
  isBarBoundary,
  planCaptureWindow,
} from './timing';
import {
  clampOffsetMs,
  defaultCaptureOffsetMs,
  getOffsetForDevice,
  setCaptureOffset,
} from './latency';
import {
  emptyFlipSession,
  loadFlipSession,
  saveFlipSession,
  upsertClip,
} from './flipStore';
import {
  gatePlayWhileRecording,
  gateRecordWhilePlaying,
  loadAllowPlayWhileRec,
  persistAllowPlayWhileRec,
} from './feedback';
import {
  applyHandoffMutes,
  restoreHandoffMutes,
  sanitizeHandoffTracks,
  type FlipHandoffTrack,
  type FlipMuteSnapshot,
} from './handoff';
import {
  FLIP_DEFAULT_BARS,
  FLIP_INPUT_KEY,
  makeFlipClipId,
  type FlipBarCount,
  type FlipClipMeta,
  type FlipHandoffPrefs,
  type FlipPhase,
  type FlipSessionRef,
  isFlipBarCount,
} from './types';
import { renderFlipAudio } from './process';

export interface FlipClockSnapshot {
  playing: boolean;
  playhead: number;
  bpm: number;
  clockSource: 'circuit' | 'internal';
}

/** Injected from Sequencer UI — Dawlessdaw Pattern mute only. */
export interface FlipHandoffHooks {
  getMuted: (track: FlipHandoffTrack) => boolean;
  setMute: (track: FlipHandoffTrack, muted: boolean) => void;
}

export interface FlipEngineStatus {
  phase: FlipPhase;
  phaseLabel: string;
  error: string | null;
  bars: FlipBarCount;
  capture: CaptureStatus;
  session: FlipSessionRef;
  activeClip: FlipClipMeta | null;
  captureOffsetMs: number;
  offsetCalibrated: boolean;
  deviceId: string | null;
  deviceLabel: string;
  monitorInput: boolean;
  allowPlayWhileRec: boolean;
  lastQuantized: boolean;
  feedbackWarn: string | null;
  elapsedCaptureMs: number;
  targetCaptureMs: number;
  loopPlaying: boolean;
  undoCount: number;
  handoff: FlipHandoffPrefs;
  /** True while a handoff mute snapshot is active (FLIP loop playing with replace on). */
  handoffActive: boolean;
}

type StatusListener = (s: FlipEngineStatus) => void;

export class FlipEngine {
  private machine: FlipMachineState = initialFlipMachine();
  private session: FlipSessionRef = loadFlipSession();
  private bars: FlipBarCount = this.session.bars || FLIP_DEFAULT_BARS;
  private deviceId: string | null = loadPersistedFlipInput();
  private deviceLabel = '';
  private captureOffsetMs = 0;
  private offsetCalibrated = false;
  private monitorInput = false;
  private allowPlayWhileRec = loadAllowPlayWhileRec();
  private listeners = new Set<StatusListener>();
  private clock: FlipClockSnapshot = {
    playing: false,
    playhead: -1,
    bpm: 120,
    clockSource: 'circuit',
  };
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private boundaryWatch: ReturnType<typeof setInterval> | null = null;
  private lastPlayhead = -1;
  private captureStartedAt = 0;
  private targetCaptureMs = 0;
  private feedbackWarn: string | null = null;
  private activeAudio: StereoAudio | null = null;
  private playCtx: AudioContext | null = null;
  private playGain: GainNode | null = null;
  private playSource: AudioBufferSourceNode | null = null;
  private playing = false;
  private captureUnsub: (() => void) | null = null;
  private undoStack: FlipClipMeta[] = [];
  private handoffHooks: FlipHandoffHooks | null = null;
  private handoffSnapshot: FlipMuteSnapshot[] | null = null;

  constructor() {
    this.captureUnsub = getCaptureEngine().subscribe(() => this.notify());
    this.syncOffsetFromDevice();
    // Restore Ready when a persisted clip ref exists (meta only — PCM may still load async).
    if (this.session.activeClipId) {
      this.machine = { phase: 'ready', error: null, lastQuantized: true };
    }
  }

  dispose(): void {
    this.captureUnsub?.();
    this.clearTimers();
    this.stopPlayback();
    if (this.playCtx) {
      void this.playCtx.close();
      this.playCtx = null;
    }
  }

  /** Wire Sequencer mute accessors (call from FlipLane mount). */
  setHandoffHooks(hooks: FlipHandoffHooks | null): void {
    this.handoffHooks = hooks;
  }

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): FlipEngineStatus {
    const active =
      this.session.clips.find((c) => c.id === this.session.activeClipId) ?? null;
    const cap = getCaptureEngine().status();
    return {
      phase: this.machine.phase,
      phaseLabel: phaseLabel(this.machine.phase),
      error: this.machine.error,
      bars: this.bars,
      capture: cap,
      session: this.session,
      activeClip: active,
      captureOffsetMs: this.captureOffsetMs,
      offsetCalibrated: this.offsetCalibrated,
      deviceId: this.deviceId,
      deviceLabel: this.deviceLabel,
      monitorInput: this.monitorInput,
      allowPlayWhileRec: this.allowPlayWhileRec,
      lastQuantized: this.machine.lastQuantized,
      feedbackWarn: this.feedbackWarn,
      elapsedCaptureMs:
        this.machine.phase === 'recording' ? Date.now() - this.captureStartedAt : 0,
      targetCaptureMs: this.targetCaptureMs,
      loopPlaying: this.playing,
      undoCount: this.undoStack.length,
      handoff: {
        replaceMidiWhilePlaying: this.session.handoff.replaceMidiWhilePlaying,
        tracks: [...this.session.handoff.tracks],
      },
      handoffActive: this.handoffSnapshot != null,
    };
  }

  updateClock(clock: FlipClockSnapshot): void {
    const wasPlaying = this.clock.playing;
    this.clock = clock;
    if (this.machine.phase === 'armed' && clock.playing && !wasPlaying) {
      this.machine = armWaiting(this.machine);
      this.startBoundaryWatch();
      this.notify();
    }
    if (this.machine.phase === 'waiting_boundary') {
      this.maybeFireBoundary();
    }
  }

  setBars(bars: FlipBarCount): void {
    if (!isFlipBarCount(bars)) return;
    this.bars = bars;
    this.session = { ...this.session, bars };
    this.persist();
    this.notify();
  }

  setInput(deviceId: string | null, label: string): void {
    this.deviceId = deviceId;
    this.deviceLabel = label;
    persistFlipInput(deviceId);
    this.syncOffsetFromDevice();
    this.notify();
  }

  setCaptureOffsetMs(ms: number, calibrated = true): void {
    this.captureOffsetMs = clampOffsetMs(ms);
    this.offsetCalibrated = calibrated;
    if (this.deviceId) {
      setCaptureOffset({
        deviceId: this.deviceId,
        deviceLabel: this.deviceLabel,
        captureOffsetMs: this.captureOffsetMs,
        calibrated,
      });
    }
    this.notify();
  }

  setMonitorInput(on: boolean): void {
    this.monitorInput = on === true;
    getCaptureEngine().setMonitorInput(this.monitorInput);
    this.session = { ...this.session, monitorInput: this.monitorInput };
    this.persist();
    if (this.monitorInput) {
      this.feedbackWarn =
        'Monitor ON — live input taps speakers. Prefer headphones to avoid feedback into the take.';
    } else {
      this.feedbackWarn = null;
    }
    this.notify();
  }

  setAllowPlayWhileRec(on: boolean): void {
    this.allowPlayWhileRec = on === true;
    persistAllowPlayWhileRec(this.allowPlayWhileRec);
    this.session = { ...this.session, allowPlayWhileRec: this.allowPlayWhileRec };
    this.persist();
    this.notify();
  }

  setReplaceMidiWhilePlaying(on: boolean): void {
    this.session = {
      ...this.session,
      handoff: {
        ...this.session.handoff,
        replaceMidiWhilePlaying: on === true,
      },
    };
    this.persist();
    if (!on && this.handoffSnapshot) {
      this.restoreHandoff();
    }
    this.notify();
  }

  setHandoffTracks(tracks: number[]): void {
    this.session = {
      ...this.session,
      handoff: {
        ...this.session.handoff,
        tracks: sanitizeHandoffTracks(tracks),
      },
    };
    this.persist();
    this.notify();
  }

  /** Restore sequencer mutes from the last handoff snapshot (undo). */
  undoHandoffMutes(): void {
    this.restoreHandoff();
    this.notify();
  }

  armQuantised(): void {
    if (this.playing && !this.allowPlayWhileRec) {
      const gate = gateRecordWhilePlaying({
        playing: this.playing,
        allowPlayWhileRec: this.allowPlayWhileRec,
        monitorInput: this.monitorInput,
      });
      this.feedbackWarn = gate.reason;
      this.notify();
      return;
    }
    this.machine = transition(this.machine, { type: 'ARM' });
    if (this.clock.playing) {
      this.machine = armWaiting(this.machine);
      this.startBoundaryWatch();
    }
    this.notify();
  }

  disarm(): void {
    this.clearTimers();
    this.machine = transition(this.machine, { type: 'DISARM' });
    this.notify();
  }

  async captureNow(): Promise<void> {
    await this.beginRecording(false);
  }

  async cancel(): Promise<void> {
    this.clearTimers();
    if (this.machine.phase === 'recording') {
      try {
        await getCaptureEngine().stop();
      } catch {
        // ignore
      }
    }
    this.machine = transition(this.machine, { type: 'CANCEL' });
    this.notify();
  }

  clear(): void {
    this.stopPlayback();
    this.machine = transition(this.machine, { type: 'CLEAR' });
    this.notify();
  }

  private applyHandoffIfNeeded(): void {
    if (!this.session.handoff.replaceMidiWhilePlaying) return;
    if (!this.handoffHooks) return;
    if (this.handoffSnapshot) return;
    const tracks = sanitizeHandoffTracks(this.session.handoff.tracks);
    this.handoffSnapshot = applyHandoffMutes(
      tracks,
      this.handoffHooks.getMuted,
      this.handoffHooks.setMute,
    );
  }

  private restoreHandoff(): void {
    if (!this.handoffSnapshot) return;
    const snap = this.handoffSnapshot;
    this.handoffSnapshot = null;
    if (this.handoffHooks) {
      restoreHandoffMutes(snap, this.handoffHooks.setMute);
    }
  }

  async playLoop(): Promise<void> {
    const gate = gatePlayWhileRecording({
      recording: this.machine.phase === 'recording',
      allowPlayWhileRec: this.allowPlayWhileRec,
    });
    if (!gate.allow) {
      this.feedbackWarn = gate.reason;
      this.notify();
      return;
    }
    const clip = this.status().activeClip;
    if (!clip) return;
    const source = this.activeAudio ?? (await loadTakeAudio(clip.takeId));
    if (!source) {
      this.machine = transition(this.machine, {
        type: 'ERROR',
        message: 'Missing take audio in IndexedDB',
      });
      this.notify();
      return;
    }
    this.activeAudio = source;
    const rendered = renderFlipAudio(source, clip);
    await this.startBufferLoop(rendered, clip.gain);
    this.applyHandoffIfNeeded();
    if (gate.warnPlaybackReentry) {
      this.feedbackWarn =
        'Software playback may re-enter the mix if FLIP out feeds the capture interface.';
    }
    this.notify();
  }

  stopPlayback(): void {
    try {
      this.playSource?.stop();
    } catch {
      // ignore
    }
    this.playSource = null;
    this.playing = false;
    this.restoreHandoff();
    this.notify();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setGain(gain: number): void {
    const clip = this.status().activeClip;
    if (!clip) return;
    const next = { ...clip, gain: Math.max(0, Math.min(4, gain)) };
    this.pushUndo(clip);
    this.session = upsertClip(this.session, next);
    this.persist();
    if (this.playGain) this.playGain.gain.value = next.gain;
    this.notify();
  }

  setTrim(startFrame: number, endFrame: number): void {
    const clip = this.status().activeClip;
    if (!clip) return;
    const start = Math.max(0, Math.min(clip.frameCount, Math.floor(startFrame)));
    const end = Math.max(start, Math.min(clip.frameCount, Math.floor(endFrame)));
    const next = { ...clip, trim: { startFrame: start, endFrame: end } };
    this.pushUndo(clip);
    this.session = upsertClip(this.session, next);
    this.persist();
    this.notify();
  }

  /**
   * Performance Memory → FLIP: adopt an existing Session take region as a FLIP clip.
   * Does not re-record; PCM stays in IndexedDB under takeId.
   */
  async importTakeRegion(opts: {
    take: TakeMeta;
    startFrame: number;
    endFrame: number;
    bpm?: number;
  }): Promise<FlipClipMeta | null> {
    const audio = await loadTakeAudio(opts.take.id);
    if (!audio) return null;
    const start = Math.max(0, Math.min(audio.left.length, Math.floor(opts.startFrame)));
    const end = Math.max(start + 1, Math.min(audio.left.length, Math.floor(opts.endFrame)));
    const bpm = opts.bpm && opts.bpm > 0 ? opts.bpm : this.clock.bpm || 120;
    const contentFrames = end - start;
    const seconds = contentFrames / audio.sampleRate;
    const barsGuess = Math.max(1, Math.round((seconds * bpm) / 240));
    const bars: FlipBarCount = isFlipBarCount(barsGuess)
      ? barsGuess
      : barsGuess <= 2
        ? 2
        : barsGuess <= 4
          ? 4
          : 8;

    const clip: FlipClipMeta = {
      schemaVersion: 1,
      id: makeFlipClipId(),
      takeId: opts.take.id,
      name: `${opts.take.name} · range`,
      createdAt: Date.now(),
      bars,
      bpm,
      sampleRate: audio.sampleRate,
      frameCount: audio.left.length,
      inputDeviceId: null,
      inputDeviceLabel: opts.take.tags.inputDeviceName || 'Session take',
      captureOffsetMs: 0,
      trim: { startFrame: start, endFrame: end },
      alignment: 'unknown',
      confidence: 'medium',
      confidenceNote: 'Imported from Sessions trim — alignment not re-measured',
      reverse: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      gain: 1,
      chop: null,
      sliceSeq: null,
      clockSource: 'none',
    };
    this.activeAudio = audio;
    this.session = upsertClip(this.session, clip);
    this.persist();
    // Jump straight to ready — no re-record / process pipeline.
    this.machine = { phase: 'ready', error: null, lastQuantized: false };
    getPerformanceMemory().recordFlip({
      phase: 'ready',
      summary: 'FLIP range from Sessions',
      data: { takeId: opts.take.id, start, end },
    });
    this.notify();
    return clip;
  }

  setReverse(on: boolean): void {
    this.patchClip({ reverse: on === true });
  }

  setFades(fadeInMs: number, fadeOutMs: number): void {
    this.patchClip({
      fadeInMs: Math.max(0, fadeInMs),
      fadeOutMs: Math.max(0, fadeOutMs),
    });
  }

  setChop(slices: 4 | 8 | 16 | null): void {
    const clip = this.status().activeClip;
    if (!clip) return;
    const chop = slices ? { slices } : null;
    const sliceSeq = slices
      ? {
          length: 16,
          choke: true,
          steps: Array.from({ length: 16 }, (_, i) => ({
            slice: i < slices ? i % slices : -1,
          })),
        }
      : clip.sliceSeq;
    this.patchClip({ chop, sliceSeq });
  }

  setSliceStep(step: number, slice: number): void {
    const clip = this.status().activeClip;
    if (!clip?.sliceSeq) return;
    const steps = clip.sliceSeq.steps.map((s, i) =>
      i === step ? { slice } : { ...s },
    );
    this.patchClip({ sliceSeq: { ...clip.sliceSeq, steps } });
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.session = upsertClip(this.session, prev);
    this.persist();
    this.notify();
  }

  undoCount(): number {
    return this.undoStack.length;
  }

  restoreSession(session?: FlipSessionRef): void {
    this.session = session ?? loadFlipSession();
    this.bars = this.session.bars;
    this.allowPlayWhileRec = this.session.allowPlayWhileRec;
    this.monitorInput = this.session.monitorInput;
    if (this.session.activeClipId) {
      this.machine = { phase: 'ready', error: null, lastQuantized: true };
    } else {
      this.machine = initialFlipMachine();
    }
    this.notify();
  }

  getRenderedAudio = async (): Promise<StereoAudio | null> => {
    const clip = this.status().activeClip;
    if (!clip) return null;
    const source = this.activeAudio ?? (await loadTakeAudio(clip.takeId));
    if (!source) return null;
    this.activeAudio = source;
    return renderFlipAudio(source, clip);
  };

  private patchClip(patch: Partial<FlipClipMeta>): void {
    const clip = this.status().activeClip;
    if (!clip) return;
    this.pushUndo(clip);
    this.session = upsertClip(this.session, { ...clip, ...patch });
    this.persist();
    this.notify();
  }

  private pushUndo(clip: FlipClipMeta): void {
    this.undoStack.push({ ...clip, trim: { ...clip.trim } });
    if (this.undoStack.length > 32) this.undoStack.shift();
  }

  private syncOffsetFromDevice(): void {
    const profile = getOffsetForDevice(this.deviceId);
    if (profile) {
      this.captureOffsetMs = profile.captureOffsetMs;
      this.offsetCalibrated = profile.calibrated;
      if (!this.deviceLabel) this.deviceLabel = profile.deviceLabel;
    } else {
      this.captureOffsetMs = defaultCaptureOffsetMs();
      this.offsetCalibrated = false;
    }
  }

  private startBoundaryWatch(): void {
    this.clearBoundaryWatch();
    this.lastPlayhead = this.clock.playhead;
    this.boundaryWatch = setInterval(() => this.maybeFireBoundary(), 16);
  }

  private clearBoundaryWatch(): void {
    if (this.boundaryWatch) {
      clearInterval(this.boundaryWatch);
      this.boundaryWatch = null;
    }
  }

  private clearTimers(): void {
    this.clearBoundaryWatch();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }

  private maybeFireBoundary(): void {
    if (this.machine.phase !== 'waiting_boundary') return;
    const ph = this.clock.playhead;
    const prev = this.lastPlayhead;
    this.lastPlayhead = ph;
    if (ph === 0 && prev !== 0) {
      void this.beginRecording(true);
      return;
    }
    if (isBarBoundary(ph) && ph !== 0 && prev !== ph && prev >= 0) {
      void this.beginRecording(true);
    }
  }

  private async beginRecording(quantized: boolean): Promise<void> {
    const gate = gateRecordWhilePlaying({
      playing: this.playing,
      allowPlayWhileRec: this.allowPlayWhileRec,
      monitorInput: this.monitorInput,
    });
    if (!gate.allow) {
      this.feedbackWarn = gate.reason;
      this.notify();
      return;
    }
    if (gate.warnPlaybackReentry && this.playing) {
      this.feedbackWarn =
        'Recording while software playback is audible — intentional resample enabled.';
    }

    const eng = getCaptureEngine();
    if (eng.status().state !== 'idle') {
      this.machine = transition(this.machine, {
        type: 'ERROR',
        message: 'Session Recorder is busy — stop that take first',
      });
      this.notify();
      return;
    }

    // Free the silent analyser preview before CaptureEngine opens the same input.
    try {
      await getInputPreviewEngine().stop();
    } catch {
      // ignore
    }

    this.clearBoundaryWatch();
    this.machine = quantized
      ? transition(this.machine, { type: 'BOUNDARY' })
      : transition(this.machine, { type: 'START_REC' });
    if (this.machine.phase !== 'recording') {
      this.machine = { phase: 'recording', error: null, lastQuantized: quantized };
    }

    const window = planCaptureWindow(this.clock.bpm, this.bars);
    this.targetCaptureMs = window.totalMs;
    this.captureStartedAt = Date.now();

    try {
      eng.setMonitorInput(this.monitorInput);
      await eng.start({
        deviceId: this.deviceId,
        deviceLabel: this.deviceLabel || 'Audio input',
        name: `FLIP ${this.bars} bar`,
        monitorInput: this.monitorInput,
        tags: {
          tempoBpm: this.clock.bpm,
          studioScene: 'flip',
          inputDeviceName: this.deviceLabel || 'Audio input',
        },
      });
    } catch (e) {
      this.machine = transition(this.machine, {
        type: 'ERROR',
        message: e instanceof Error ? e.message : 'Capture start failed',
      });
      this.notify();
      return;
    }

    this.stopTimer = setTimeout(() => {
      void this.finishRecording();
    }, window.totalMs);
    this.notify();
  }

  private async finishRecording(): Promise<void> {
    this.clearTimers();
    if (this.machine.phase !== 'recording') return;
    this.machine = transition(this.machine, { type: 'STOP_REC' });
    this.notify();

    let meta: TakeMeta | null = null;
    try {
      meta = await getCaptureEngine().stop();
    } catch (e) {
      this.machine = transition(this.machine, {
        type: 'PROCESS_FAIL',
        message: e instanceof Error ? e.message : 'Stop failed',
      });
      this.notify();
      return;
    }

    if (!meta) {
      this.machine = transition(this.machine, {
        type: 'PROCESS_FAIL',
        message: 'No take produced',
      });
      this.notify();
      return;
    }

    try {
      const audio = await loadTakeAudio(meta.id);
      if (!audio) throw new Error('Take audio missing after save');
      this.activeAudio = audio;

      const trim = buildTrimFromCapture({
        frameCount: audio.left.length,
        sampleRate: audio.sampleRate,
        bpm: this.clock.bpm,
        bars: this.bars,
        captureOffsetMs: this.captureOffsetMs,
      });
      const expected = expectedContentFrames(
        this.clock.bpm,
        this.bars,
        audio.sampleRate,
      );
      const trimExact = trim.endFrame - trim.startFrame === expected;
      const align = assessAlignment({
        quantized: this.machine.lastQuantized,
        clockSource: this.machine.lastQuantized ? this.clock.clockSource : 'none',
        captureOffsetMs: this.captureOffsetMs,
        calibrated: this.offsetCalibrated,
        trimExact,
      });

      const clip: FlipClipMeta = {
        schemaVersion: 1,
        id: makeFlipClipId(),
        takeId: meta.id,
        name: meta.name,
        createdAt: Date.now(),
        bars: this.bars,
        bpm: this.clock.bpm,
        sampleRate: audio.sampleRate,
        frameCount: audio.left.length,
        inputDeviceId: this.deviceId,
        inputDeviceLabel: this.deviceLabel,
        captureOffsetMs: this.captureOffsetMs,
        trim,
        alignment: align.alignment,
        confidence: align.confidence,
        confidenceNote: align.note,
        reverse: false,
        fadeInMs: 0,
        fadeOutMs: 0,
        gain: 1,
        chop: null,
        sliceSeq: null,
        clockSource: this.machine.lastQuantized ? this.clock.clockSource : 'none',
      };
      this.session = upsertClip(this.session, clip);
      this.persist();
      this.machine = transition(this.machine, { type: 'PROCESS_DONE' });
    } catch (e) {
      this.machine = transition(this.machine, {
        type: 'PROCESS_FAIL',
        message: e instanceof Error ? e.message : 'Processing failed',
      });
    }
    this.notify();
  }

  private async startBufferLoop(audio: StereoAudio, gain: number): Promise<void> {
    this.stopPlayback();
    if (!this.playCtx) {
      this.playCtx = new AudioContext({ sampleRate: audio.sampleRate });
    }
    if (this.playCtx.state === 'suspended') await this.playCtx.resume();
    const buffer = this.playCtx.createBuffer(2, audio.left.length, audio.sampleRate);
    buffer.copyToChannel(Float32Array.from(audio.left), 0);
    buffer.copyToChannel(Float32Array.from(audio.right), 1);
    const src = this.playCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.playCtx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.playCtx.destination);
    this.playGain = g;
    this.playSource = src;
    src.onended = () => {
      this.playing = false;
      this.restoreHandoff();
      this.notify();
    };
    src.start();
    this.playing = true;
  }

  private persist(): void {
    saveFlipSession(this.session);
  }

  private notify(): void {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }
}

function loadPersistedFlipInput(): string | null {
  try {
    return localStorage.getItem(FLIP_INPUT_KEY);
  } catch {
    return null;
  }
}

function persistFlipInput(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(FLIP_INPUT_KEY, deviceId);
    else localStorage.removeItem(FLIP_INPUT_KEY);
  } catch {
    // ignore
  }
}

let shared: FlipEngine | null = null;
export function getFlipEngine(): FlipEngine {
  if (!shared) shared = new FlipEngine();
  return shared;
}

export function resetFlipEngineForTests(): void {
  shared?.dispose();
  shared = null;
}

export { emptyFlipSession };
