/**
 * Session Recorder capture: getUserMedia → AudioWorklet raw PCM (not MediaRecorder).
 * IndexedDB chunk persistence while recording.
 *
 * Graph: MediaStreamSource → Worklet (PCM + meters) only.
 * Worklet → silent gain → destination keeps the node alive without monitoring.
 * Live input never reaches destination unless Monitor input is explicitly ON.
 *
 * Swappable contract: `@dawlessdaw/audio` (`AudioBackend` / `WorkletAudioBackend`).
 * This engine remains the production Sessions/FLIP owner — thin seam, not a rewrite.
 */
import {
  CLIP_HOLD_MS,
  CLIP_LINEAR,
  type TakeMarker,
  type TakeMeta,
  type TakePerformanceEvent,
} from './types';
import {
  appendChunksBatch,
  beginDraft,
  makeTakeId,
  finalizeCompleteTake,
  buildTags,
  defaultTakeName,
  type TakeTags,
} from './takeStore';
import { stitchChunks, type PcmChunk } from './stitch';
import { isClipping } from './pcmMath';
import {
  loadPersistedMonitorInput,
  persistMonitorInput,
  planCaptureGraph,
} from './captureGraph';
import { buildCaptureConstraints } from './captureSettings';
import {
  CapturePersistBuffer,
  emptyCaptureBufferStats,
  estimatePersistChunkRate,
  estimateWorkletMsgRate,
  type CaptureBufferStats,
} from './captureBuffer';

export type CaptureState = 'idle' | 'recording' | 'stopping';

export interface MeterLevels {
  left: number;
  right: number;
  clipLeft: boolean;
  clipRight: boolean;
}

export interface CaptureBufferReport extends CaptureBufferStats {
  /** Cheap derived rates (0 while elapsed is tiny). */
  workletMsgsPerSec: number;
  persistChunksPerSec: number;
}

export interface CaptureStatus {
  state: CaptureState;
  elapsedMs: number;
  frames: number;
  sampleRate: number;
  meters: MeterLevels;
  takeId: string | null;
  /** Speaker monitoring of the live input (default off). */
  monitorInput: boolean;
  /** P3: batched persist / drop counters (honesty for recovery). */
  buffer: CaptureBufferReport;
}

type StatusListener = (s: CaptureStatus) => void;

export interface StartCaptureOpts {
  deviceId: string | null;
  deviceLabel: string;
  tags: Partial<TakeTags>;
  name?: string;
  /** Override monitor for this take; omit to use persisted / default OFF. */
  monitorInput?: boolean;
}

export class CaptureEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  /** Keeps worklet in the render graph; gain stays 0 (worklet outputs are silence). */
  private keepAliveGain: GainNode | null = null;
  /** Optional mic → speakers tap; only connected when monitorInput is true. */
  private monitorGain: GainNode | null = null;
  private monitorConnected = false;
  private monitorInput = loadPersistedMonitorInput();
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
  private listeners = new Set<StatusListener>();
  private raf = 0;
  private persistBuffer = new CapturePersistBuffer({
    appendBatch: (takeId, chunks) => appendChunksBatch(takeId, chunks),
  });
  private lastBufferStats: CaptureBufferStats = emptyCaptureBufferStats();

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): CaptureStatus {
    const elapsedMs =
      this.state === 'recording' || this.state === 'stopping'
        ? Date.now() - this.startedAt
        : 0;
    const snap =
      this.state === 'recording' || this.state === 'stopping'
        ? this.persistBuffer.snapshot()
        : this.lastBufferStats;
    return {
      state: this.state,
      elapsedMs,
      frames: this.frames,
      sampleRate: this.ctx?.sampleRate ?? 48000,
      meters: { ...this.meters },
      takeId: this.takeId,
      monitorInput: this.monitorInput,
      buffer: {
        ...snap,
        workletMsgsPerSec: estimateWorkletMsgRate(snap, elapsedMs),
        persistChunksPerSec: estimatePersistChunkRate(snap, elapsedMs),
      },
    };
  }

  /** Explicit speaker monitor of the live input. Default OFF. */
  setMonitorInput(on: boolean): void {
    this.monitorInput = on === true;
    persistMonitorInput(this.monitorInput);
    this.applyMonitorWiring();
    this.notify();
  }

  getMonitorInput(): boolean {
    return this.monitorInput;
  }

  private applyMonitorWiring(): void {
    if (!this.ctx || !this.source) return;
    const plan = planCaptureGraph(this.monitorInput);
    if (plan.sourceToDestination) {
      if (!this.monitorGain) {
        this.monitorGain = this.ctx.createGain();
        this.monitorGain.gain.value = 1;
      }
      if (!this.monitorConnected) {
        this.source.connect(this.monitorGain);
        this.monitorGain.connect(this.ctx.destination);
        this.monitorConnected = true;
      }
    } else if (this.monitorConnected && this.monitorGain) {
      try {
        this.source.disconnect(this.monitorGain);
      } catch {
        // ignore
      }
      try {
        this.monitorGain.disconnect();
      } catch {
        // ignore
      }
      this.monitorConnected = false;
      this.monitorGain = null;
    }
  }

  private notify(): void {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }

  async start(opts: StartCaptureOpts): Promise<void> {
    if (this.state !== 'idle') throw new Error('Already recording');

    if (typeof opts.monitorInput === 'boolean') {
      this.monitorInput = opts.monitorInput;
      persistMonitorInput(this.monitorInput);
    }

    if (!opts.deviceId) {
      throw new Error('Plug in an interface');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: buildCaptureConstraints(opts.deviceId, 48000),
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
    this.lastBufferStats = emptyCaptureBufferStats();
    this.persistBuffer.begin(takeId);

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

      // P3: sync enqueue only — IndexedDB via batched flush (no SAB).
      this.persistBuffer.push({ index, samples: copy });
    };

    // Mic → worklet only (PCM + meters). Never mic → destination unless monitor ON.
    this.source.connect(this.worklet);
    // Keep worklet in the render graph via silent outputs (processor zeros them).
    this.keepAliveGain = this.ctx.createGain();
    this.keepAliveGain.gain.value = 0;
    this.worklet.connect(this.keepAliveGain);
    this.keepAliveGain.connect(this.ctx.destination);
    this.monitorConnected = false;
    this.monitorGain = null;
    this.applyMonitorWiring();

    const tick = () => {
      if (this.state !== 'recording') return;
      this.notify();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.notify();
  }

  addMarker(
    label: string,
    source: TakeMarker['source'] = 'manual',
    extra?: Partial<Pick<TakeMarker, 'id' | 'inferred'>>,
  ): TakeMarker | null {
    if (this.state !== 'recording' || !this.ctx) return null;
    const sample = this.frames;
    const marker: TakeMarker = {
      id: extra?.id,
      sample,
      seconds: sample / this.ctx.sampleRate,
      label,
      source,
      inferred: extra?.inferred ?? source === 'inferred',
    };
    this.markers.push(marker);
    if (this.meta) this.meta.markers = [...this.markers];
    return marker;
  }

  /**
   * Stop capture. Optional Performance Memory enrichment replaces markers and
   * attaches the event timeline (original observations kept on the take).
   */
  async stop(enrichment?: {
    markers?: TakeMarker[];
    performanceEvents?: TakePerformanceEvent[];
  }): Promise<TakeMeta | null> {
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
      this.keepAliveGain?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.monitorGain?.disconnect();
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
    this.keepAliveGain = null;
    this.monitorGain = null;
    this.monitorConnected = false;
    this.stream = null;
    this.ctx = null;

    this.lastBufferStats = await this.persistBuffer.end();

    const audio = stitchChunks(this.chunks, this.meta.sampleRate);
    const meta: TakeMeta = {
      ...this.meta,
      markers: enrichment?.markers ?? [...this.markers],
      ...(enrichment?.performanceEvents
        ? { performanceEvents: enrichment.performanceEvents }
        : {}),
      frameCount: audio.left.length,
      durationSec: audio.left.length / this.meta.sampleRate,
      incomplete: false,
    };

    const phase = await finalizeCompleteTake(meta, audio);
    if (phase !== 'saved_and_cleared') {
      // Keep RAM chunks + IndexedDB draft/chunks for recovery — do not wipe.
      this.state = 'idle';
      this.notify();
      throw new Error(
        phase === 'verify_failed'
          ? 'Take save could not be verified — recovery kept'
          : 'Take save failed — recovery kept',
      );
    }

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
