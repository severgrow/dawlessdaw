/**
 * Live input meter/preview graph — analyser only, no recording.
 *
 * Mirrors Session Recorder captureGraph policy:
 *   source → analysers (meters / mini-wave)
 *   Never source → destination (no speaker monitoring from this engine).
 * CaptureEngine remains the recording path (AudioWorklet PCM + meters).
 */
import {
  classifyInputLevel,
  peakFromTimeDomain,
  type InputLevelKind,
} from './inputPreviewLevels';
import type { MeterLevels } from './captureEngine';

export interface InputPreviewStatus {
  running: boolean;
  deviceId: string | null;
  meters: MeterLevels;
  kind: InputLevelKind;
  error: string | null;
}

type StatusListener = (s: InputPreviewStatus) => void;

const EMPTY_METERS: MeterLevels = {
  left: 0,
  right: 0,
  clipLeft: false,
  clipRight: false,
};

/**
 * Open a silent analyser tap on an audio input.
 * Does not enable monitoring — speakers stay quiet even if FLIP Monitor is on.
 */
export class InputPreviewEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private split: ChannelSplitterNode | null = null;
  private left: AnalyserNode | null = null;
  private right: AnalyserNode | null = null;
  private mix: AnalyserNode | null = null;
  private deviceId: string | null = null;
  private meters: MeterLevels = { ...EMPTY_METERS };
  private kind: InputLevelKind = 'silence';
  private error: string | null = null;
  private running = false;
  private raf = 0;
  private listeners = new Set<StatusListener>();
  private leftBuf: Float32Array | null = null;
  private rightBuf: Float32Array | null = null;
  private mixByte: Uint8Array | null = null;

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): InputPreviewStatus {
    return {
      running: this.running,
      deviceId: this.deviceId,
      meters: { ...this.meters },
      kind: this.kind,
      error: this.error,
    };
  }

  /** Latest mix time-domain bytes for mini-wave drawing (or null if idle). */
  readMixTimeDomain(into: Uint8Array): boolean {
    if (!this.mix || !this.running) return false;
    this.mix.getByteTimeDomainData(into as Uint8Array<ArrayBuffer>);
    return true;
  }

  mixFftSize(): number {
    return this.mix?.fftSize ?? 0;
  }

  async start(deviceId: string | null): Promise<void> {
    await this.stop();
    this.error = null;
    this.deviceId = deviceId;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.error = 'Audio input preview needs a browser with getUserMedia';
      this.notify();
      return;
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.mix = this.ctx.createAnalyser();
      this.mix.fftSize = 1024;
      this.mix.smoothingTimeConstant = 0.65;

      this.split = this.ctx.createChannelSplitter(2);
      this.left = this.ctx.createAnalyser();
      this.right = this.ctx.createAnalyser();
      this.left.fftSize = this.right.fftSize = 512;
      this.left.smoothingTimeConstant = this.right.smoothingTimeConstant = 0.5;

      // Analyser graph only — never connect source to destination (no feedback path).
      this.source.connect(this.mix);
      this.source.connect(this.split);
      this.split.connect(this.left, 0);
      this.split.connect(this.right, 1);

      this.leftBuf = new Float32Array(this.left.fftSize);
      this.rightBuf = new Float32Array(this.right.fftSize);
      this.mixByte = new Uint8Array(this.mix.fftSize);
      this.running = true;
      this.tick();
      this.notify();
    } catch (e) {
      await this.teardown();
      const name = e instanceof DOMException ? e.name : '';
      this.error =
        name === 'NotAllowedError'
          ? 'Allow the microphone to see live input levels'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'Selected input unavailable'
            : 'Could not open input for preview';
      this.notify();
    }
  }

  async stop(): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    await this.teardown();
    this.meters = { ...EMPTY_METERS };
    this.kind = 'silence';
    this.running = false;
    this.notify();
  }

  private async teardown(): Promise<void> {
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.split?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.mix?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.left?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.right?.disconnect();
    } catch {
      // ignore
    }
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.split = null;
    this.mix = null;
    this.left = null;
    this.right = null;
    this.leftBuf = null;
    this.rightBuf = null;
    this.mixByte = null;
  }

  private tick = (): void => {
    if (!this.running || !this.left || !this.right || !this.leftBuf || !this.rightBuf) return;
    this.left.getFloatTimeDomainData(this.leftBuf as Float32Array<ArrayBuffer>);
    this.right.getFloatTimeDomainData(this.rightBuf as Float32Array<ArrayBuffer>);
    const peakL = peakFromTimeDomain(this.leftBuf);
    const peakR = peakFromTimeDomain(this.rightBuf);
    this.meters = {
      left: peakL,
      right: peakR,
      clipLeft: peakL >= 0.99,
      clipRight: peakR >= 0.99,
    };
    this.kind = classifyInputLevel(peakL, peakR);
    this.notify();
    this.raf = requestAnimationFrame(this.tick);
  };

  private notify(): void {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }
}

let shared: InputPreviewEngine | null = null;

export function getInputPreviewEngine(): InputPreviewEngine {
  if (!shared) shared = new InputPreviewEngine();
  return shared;
}

export async function resetInputPreviewForTests(): Promise<void> {
  if (shared) await shared.stop();
  shared = null;
}
