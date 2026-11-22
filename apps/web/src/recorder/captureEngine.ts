/**
 * Session Recorder capture: getUserMedia → AudioWorklet raw PCM (not MediaRecorder).
 * IndexedDB chunk persistence while recording.
 */
import { CLIP_HOLD_MS, CLIP_LINEAR, type TakeMarker, type TakeMeta } from './types';
import {
  appendChunk,
  beginDraft,
  clearChunks,
  clearDraft,
  makeTakeId,
  saveCompleteTake,
  buildTags,
  defaultTakeName,
  type TakeTags,
} from './takeStore';
import { stitchChunks, type PcmChunk } from './stitch';
import { isClipping } from './pcmMath';

export type CaptureState = 'idle' | 'recording' | 'stopping';

export interface MeterLevels {
  left: number;
  right: number;
  clipLeft: boolean;
  clipRight: boolean;
}

export interface CaptureStatus {
  state: CaptureState;
  elapsedMs: number;
  frames: number;
  sampleRate: number;
  meters: MeterLevels;
  takeId: string | null;
}

type StatusListener = (s: CaptureStatus) => void;

export interface StartCaptureOpts {
  deviceId: string | null;
  deviceLabel: string;
  tags: Partial<TakeTags>;
  name?: string;
}

export class CaptureEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private state: CaptureState = 'idle';
  private chunks: PcmChunk[] = [];
  private chunkIndex = 0;
  private frames = 0;
  private startedAt = 0;
  private takeId: string | null = null;
  private meta: TakeMeta | null = null;
  private markers: TakeMarker[] = [];
  private meters: MeterLevels = { left: 0, right: 0, clipLeft: false, clipRight: false };
  private clipLeftUntil = 0;
  private clipRightUntil = 0;
  private persistQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<StatusListener>();
  private raf = 0;

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): CaptureStatus {
    return {
      state: this.state,
      elapsedMs: this.state === 'recording' ? Date.now() - this.startedAt : 0,
      frames: this.frames,
      sampleRate: this.ctx?.sampleRate ?? 48000,
      meters: { ...this.meters },
      takeId: this.takeId,
    };
  }

  private notify(): void {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }

  async start(opts: StartCaptureOpts): Promise<void> {
    if (this.state !== 'idle') throw new Error('Already recording');

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
    };
    if (opts.deviceId) {
      audioConstraints.deviceId = { exact: opts.deviceId };
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });

    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    // Prefer device native rate if the context negotiated something else
    await this.ctx.audioWorklet.addModule('/worklets/raw-pcm-processor.js');

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, 'raw-pcm-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      outputChannelCount: [2],
    });

    const takeId = makeTakeId();
    const now = new Date();
    const tags = buildTags({
      ...opts.tags,
      inputDeviceName: opts.deviceLabel,
      recordedAt: now.toISOString(),
    });
    this.meta = {
      id: takeId,
      name: opts.name ?? defaultTakeName(now),
      createdAt: now.getTime(),
      sampleRate: this.ctx.sampleRate,
      channels: 2,
      frameCount: 0,
      durationSec: 0,
      tags,
      markers: [],
      incomplete: true,
    };
    this.takeId = takeId;
    this.chunks = [];
    this.chunkIndex = 0;
    this.frames = 0;
    this.markers = [];
    this.startedAt = Date.now();
    this.state = 'recording';

    await beginDraft(this.meta);

    this.worklet.port.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type: string; samples?: Float32Array };
      if (data.type !== 'pcm' || !data.samples || this.state !== 'recording') return;
      const samples = data.samples;
      const frames = Math.floor(samples.length / 2);
      let peakL = 0;
      let peakR = 0;
      for (let i = 0; i < frames; i++) {
        const l = Math.abs(samples[i * 2]!);
        const r = Math.abs(samples[i * 2 + 1]!);
        if (l > peakL) peakL = l;
        if (r > peakR) peakR = r;
      }
      const nowMs = performance.now();
      if (isClipping(peakL)) this.clipLeftUntil = nowMs + CLIP_HOLD_MS;
      if (isClipping(peakR)) this.clipRightUntil = nowMs + CLIP_HOLD_MS;
      this.meters = {
        left: peakL,
        right: peakR,
        clipLeft: nowMs < this.clipLeftUntil || peakL >= CLIP_LINEAR,
        clipRight: nowMs < this.clipRightUntil || peakR >= CLIP_LINEAR,
      };

      const index = this.chunkIndex++;
      const copy = samples.slice();
      this.chunks.push({ index, samples: copy });
      this.frames += frames;

      const tid = this.takeId!;
      this.persistQueue = this.persistQueue
        .then(() => appendChunk(tid, index, copy))
        .catch(() => {
          // keep recording in RAM if IDB fails
        });
    };

    this.source.connect(this.worklet);
    // Keep graph alive without monitoring through speakers
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.source.connect(mute);
    mute.connect(this.ctx.destination);

    const tick = () => {
      if (this.state !== 'recording') return;
      this.notify();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.notify();
  }

  addMarker(label: string, source: TakeMarker['source'] = 'manual'): TakeMarker | null {
    if (this.state !== 'recording' || !this.ctx) return null;
    const sample = this.frames;
    const marker: TakeMarker = {
      sample,
      seconds: sample / this.ctx.sampleRate,
      label,
      source,
    };
    this.markers.push(marker);
    if (this.meta) this.meta.markers = [...this.markers];
    return marker;
  }

  async stop(): Promise<TakeMeta | null> {
    if (this.state !== 'recording' || !this.meta || !this.ctx) return null;
    this.state = 'stopping';
    cancelAnimationFrame(this.raf);

    this.worklet?.port.close();
    try {
      this.worklet?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    await this.ctx.close();
    this.worklet = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;

    await this.persistQueue;

    const audio = stitchChunks(this.chunks, this.meta.sampleRate);
    const meta: TakeMeta = {
      ...this.meta,
      markers: [...this.markers],
      frameCount: audio.left.length,
      durationSec: audio.left.length / this.meta.sampleRate,
      incomplete: false,
    };

    await saveCompleteTake(meta, audio);
    await clearChunks(meta.id);
    await clearDraft();

    this.chunks = [];
    this.state = 'idle';
    this.takeId = null;
    this.meta = null;
    this.meters = { left: 0, right: 0, clipLeft: false, clipRight: false };
    this.notify();
    return meta;
  }
}

let shared: CaptureEngine | null = null;
export function getCaptureEngine(): CaptureEngine {
  if (!shared) shared = new CaptureEngine();
  return shared;
}
