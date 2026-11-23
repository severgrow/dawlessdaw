import {
  EMPTY_METERS,
  type AudioBackend,
  type AudioBackendMeters,
  type AudioBackendOpenOptions,
  type AudioBackendSnapshot,
  type AudioDeviceChangeHandler,
  type AudioInputInfo,
  type PcmHandler,
} from './backend';
import { filterSelectableAudioInputs, isBuiltInOrPhoneMic } from './mic-filter';

/**
 * Host that performs real (or test-double) I/O for the Worklet backend.
 * Production Sessions/FLIP capture remains in CaptureEngine — inject a host
 * only when wiring the seam; do not rewrite take persistence here.
 */
export interface WorkletAudioHost {
  isAvailable(): boolean;
  enumerateInputs(): Promise<Array<{ deviceId: string; label: string }>>;
  /**
   * Open capture. Must keep speaker monitor **off** unless opts.monitorInput.
   * Call sink.onPcm / sink.onMeters as frames arrive (AudioWorklet or test double).
   */
  startCapture(
    opts: AudioBackendOpenOptions,
    sink: {
      onPcm: (interleaved: Float32Array, channels: number) => void;
      onMeters: (meters: AudioBackendMeters) => void;
    },
  ): Promise<{ sampleRate: number; stop: () => void | Promise<void> }>;
}

export interface WorkletAudioBackendOptions {
  host: WorkletAudioHost;
  /** Fallback sample rate before open. */
  sampleRate?: number;
  channelCount?: number;
}

/**
 * Browser AudioWorklet-facing backend — **one** concrete AudioBackend.
 *
 * Thin seam: device list + open/close + PCM/meters listeners. CaptureEngine
 * (getUserMedia → worklet → IndexedDB) stays the Sessions/FLIP owner until a
 * later PR optionally adapts it as a WorkletAudioHost.
 */
export class WorkletAudioBackend implements AudioBackend {
  readonly name = 'WorkletAudioBackend';
  readonly kind = 'worklet' as const;

  private host: WorkletAudioHost;
  private started = false;
  private inputs: AudioInputInfo[] = [];
  private openDeviceId: string | null = null;
  private sampleRate: number;
  private channelCount: number;
  private monitorInput = false;
  private meters: AudioBackendMeters = { ...EMPTY_METERS };
  private pcmHandlers = new Set<PcmHandler>();
  private deviceHandlers = new Set<AudioDeviceChangeHandler>();
  private stopCapture: (() => void | Promise<void>) | null = null;

  constructor(opts: WorkletAudioBackendOptions) {
    this.host = opts.host;
    this.sampleRate = opts.sampleRate ?? 48000;
    this.channelCount = opts.channelCount ?? 2;
  }

  isAvailable(): boolean {
    return this.host.isAvailable();
  }

  async start(): Promise<void> {
    if (!this.host.isAvailable()) {
      throw new Error('WorkletAudioBackend host is unavailable');
    }
    this.started = true;
    await this.rescanInputs();
  }

  async stop(): Promise<void> {
    await this.close();
    this.started = false;
    this.inputs = [];
  }

  listInputs(): AudioInputInfo[] {
    return [...this.inputs];
  }

  async rescanInputs(): Promise<AudioInputInfo[]> {
    const raw = await this.host.enumerateInputs();
    this.inputs = filterSelectableAudioInputs(raw).map((d) => ({
      deviceId: d.deviceId,
      label: d.label,
    }));
    this.emitDevices();
    return this.listInputs();
  }

  async open(opts: AudioBackendOpenOptions): Promise<void> {
    if (!this.started) {
      throw new Error('WorkletAudioBackend.start() required before open()');
    }
    if (!opts.deviceId) {
      throw new Error('Plug in an interface');
    }
    if (isBuiltInOrPhoneMic('', opts.deviceId)) {
      throw new Error('Built-in / Continuity microphones are not selectable');
    }
    // Reject if the device was filtered out (or never listed).
    const known = this.inputs.find((d) => d.deviceId === opts.deviceId);
    if (!known) {
      // Also reject if host still exposes a built-in under this id.
      const raw = await this.host.enumerateInputs();
      const hit = raw.find((d) => d.deviceId === opts.deviceId);
      if (hit && isBuiltInOrPhoneMic(hit.label, hit.deviceId)) {
        throw new Error('Built-in / Continuity microphones are not selectable');
      }
      throw new Error(`Unknown or non-selectable audio input: ${opts.deviceId}`);
    }

    await this.close();

    const openOpts: AudioBackendOpenOptions = {
      ...opts,
      monitorInput: opts.monitorInput === true,
      sampleRate: opts.sampleRate ?? this.sampleRate,
      channelCount: opts.channelCount ?? this.channelCount,
    };

    const handle = await this.host.startCapture(openOpts, {
      onPcm: (interleaved, channels) => {
        this.channelCount = channels;
        const meta = { channels, sampleRate: this.sampleRate };
        for (const h of this.pcmHandlers) h(interleaved, meta);
      },
      onMeters: (m) => {
        this.meters = { ...m };
      },
    });

    this.openDeviceId = opts.deviceId;
    this.sampleRate = handle.sampleRate;
    this.monitorInput = openOpts.monitorInput === true;
    this.stopCapture = handle.stop;
    if (typeof opts.channelCount === 'number' && opts.channelCount > 0) {
      this.channelCount = opts.channelCount;
    }
  }

  async close(): Promise<void> {
    const stop = this.stopCapture;
    this.stopCapture = null;
    this.openDeviceId = null;
    this.monitorInput = false;
    this.meters = { ...EMPTY_METERS };
    if (stop) await stop();
  }

  isOpen(): boolean {
    return this.openDeviceId !== null;
  }

  getMeters(): AudioBackendMeters {
    return { ...this.meters };
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  getMonitorInput(): boolean {
    return this.monitorInput;
  }

  onPcm(handler: PcmHandler): () => void {
    this.pcmHandlers.add(handler);
    return () => this.pcmHandlers.delete(handler);
  }

  onDevicesChanged(handler: AudioDeviceChangeHandler): () => void {
    this.deviceHandlers.add(handler);
    return () => this.deviceHandlers.delete(handler);
  }

  snapshot(): AudioBackendSnapshot {
    return {
      kind: this.kind,
      name: this.name,
      running: this.started,
      open: this.isOpen(),
      deviceId: this.openDeviceId,
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      monitorInput: this.monitorInput,
      inputCount: this.inputs.length,
    };
  }

  private emitDevices(): void {
    const inputs = this.listInputs();
    for (const h of this.deviceHandlers) h(inputs);
  }
}

/**
 * In-memory host for testing WorkletAudioBackend wiring without a browser.
 * Simulates AudioWorklet delivery via pushPcm / pushMeters.
 */
export class MemoryWorkletHost implements WorkletAudioHost {
  private catalog: Array<{ deviceId: string; label: string }>;
  private available: boolean;
  private stopFn: (() => void) | null = null;
  private sink: {
    onPcm: (interleaved: Float32Array, channels: number) => void;
    onMeters: (meters: AudioBackendMeters) => void;
  } | null = null;
  private sampleRate: number;
  private channels: number;

  constructor(
    catalog: Array<{ deviceId: string; label: string }> = [
      { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
      { deviceId: 'macbook', label: 'MacBook Pro Microphone' },
    ],
    opts: { available?: boolean; sampleRate?: number; channels?: number } = {},
  ) {
    this.catalog = [...catalog];
    this.available = opts.available !== false;
    this.sampleRate = opts.sampleRate ?? 48000;
    this.channels = opts.channels ?? 2;
  }

  isAvailable(): boolean {
    return this.available;
  }

  setAvailable(v: boolean): void {
    this.available = v;
  }

  setCatalog(catalog: Array<{ deviceId: string; label: string }>): void {
    this.catalog = [...catalog];
  }

  async enumerateInputs(): Promise<Array<{ deviceId: string; label: string }>> {
    return [...this.catalog];
  }

  async startCapture(
    opts: AudioBackendOpenOptions,
    sink: {
      onPcm: (interleaved: Float32Array, channels: number) => void;
      onMeters: (meters: AudioBackendMeters) => void;
    },
  ): Promise<{ sampleRate: number; stop: () => void | Promise<void> }> {
    this.sink = sink;
    this.channels = opts.channelCount ?? this.channels;
    this.sampleRate = opts.sampleRate ?? this.sampleRate;
    this.stopFn = () => {
      this.sink = null;
      this.stopFn = null;
    };
    return {
      sampleRate: this.sampleRate,
      stop: () => {
        this.stopFn?.();
      },
    };
  }

  pushPcm(interleaved: Float32Array): void {
    this.sink?.onPcm(interleaved, this.channels);
  }

  pushMeters(meters: AudioBackendMeters): void {
    this.sink?.onMeters(meters);
  }
}
