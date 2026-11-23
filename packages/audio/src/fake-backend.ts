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

export interface FakeAudioInputSpec {
  deviceId: string;
  label: string;
}

const DEFAULT_INPUTS: FakeAudioInputSpec[] = [
  { deviceId: 'fake-scarlett-2i2', label: 'Scarlett 2i2 USB' },
  { deviceId: 'fake-zed-10fx', label: 'Allen & Heath ZED-10FX' },
  { deviceId: 'fake-sp404', label: 'SP-404MKII' },
];

export interface FakeAudioBackendOptions {
  /** Catalog before filtering. Built-ins in this list are dropped by listInputs. */
  inputs?: FakeAudioInputSpec[];
  sampleRate?: number;
  channelCount?: number;
  /**
   * When open, emit a silent (or amplitude) PCM block on this interval (ms).
   * 0 = no automatic PCM (pushPcm only).
   */
  pcmIntervalMs?: number;
  /** Peak amplitude for generated sine (0 = silence). Default 0. */
  amplitude?: number;
}

/**
 * Deterministic headless audio backend for Vitest (Cross FakeAsioDriver concept —
 * REIMPLEMENT only; never copy AGPL).
 *
 * Never auto-selects MacBook / iPhone / Continuity mics.
 */
export class FakeAudioBackend implements AudioBackend {
  readonly name = 'FakeAudioBackend';
  readonly kind = 'fake' as const;

  private catalog: FakeAudioInputSpec[];
  private started = false;
  private openDeviceId: string | null = null;
  private sampleRate: number;
  private channelCount: number;
  private monitorInput = false;
  private meters: AudioBackendMeters = { ...EMPTY_METERS };
  private pcmHandlers = new Set<PcmHandler>();
  private deviceHandlers = new Set<AudioDeviceChangeHandler>();
  private pcmTimer: ReturnType<typeof setInterval> | null = null;
  private pcmIntervalMs: number;
  private amplitude: number;
  private framePhase = 0;

  constructor(opts: FakeAudioBackendOptions = {}) {
    this.catalog = [...(opts.inputs ?? DEFAULT_INPUTS)];
    this.sampleRate = opts.sampleRate ?? 48000;
    this.channelCount = opts.channelCount ?? 2;
    this.pcmIntervalMs = opts.pcmIntervalMs ?? 0;
    this.amplitude = opts.amplitude ?? 0;
  }

  isAvailable(): boolean {
    return true;
  }

  async start(): Promise<void> {
    this.started = true;
    this.emitDevices();
  }

  async stop(): Promise<void> {
    await this.close();
    this.started = false;
  }

  listInputs(): AudioInputInfo[] {
    return filterSelectableAudioInputs(this.catalog).map((d) => ({
      deviceId: d.deviceId,
      label: d.label,
    }));
  }

  async rescanInputs(): Promise<AudioInputInfo[]> {
    this.emitDevices();
    return this.listInputs();
  }

  /**
   * Replace catalog (e.g. inject a MacBook mic to assert it is filtered out).
   * Does not open built-ins even if present in the raw catalog.
   */
  setCatalog(inputs: FakeAudioInputSpec[]): void {
    this.catalog = [...inputs];
    if (this.started) this.emitDevices();
  }

  async open(opts: AudioBackendOpenOptions): Promise<void> {
    if (!this.started) {
      throw new Error('FakeAudioBackend.start() required before open()');
    }
    if (!opts.deviceId) {
      throw new Error('Plug in an interface');
    }
    if (isBuiltInOrPhoneMic('', opts.deviceId) || this.isBuiltInInCatalog(opts.deviceId)) {
      throw new Error('Built-in / Continuity microphones are not selectable');
    }
    const selectable = this.listInputs();
    if (!selectable.some((d) => d.deviceId === opts.deviceId)) {
      throw new Error(`Unknown or non-selectable audio input: ${opts.deviceId}`);
    }

    await this.close();

    this.openDeviceId = opts.deviceId;
    if (typeof opts.sampleRate === 'number' && opts.sampleRate > 0) {
      this.sampleRate = opts.sampleRate;
    }
    if (typeof opts.channelCount === 'number' && opts.channelCount > 0) {
      this.channelCount = opts.channelCount;
    }
    this.monitorInput = opts.monitorInput === true;
    this.meters = { ...EMPTY_METERS };
    this.framePhase = 0;

    if (this.pcmIntervalMs > 0) {
      this.pcmTimer = setInterval(() => {
        this.emitGeneratedBlock();
      }, this.pcmIntervalMs);
    }
  }

  async close(): Promise<void> {
    if (this.pcmTimer) {
      clearInterval(this.pcmTimer);
      this.pcmTimer = null;
    }
    this.openDeviceId = null;
    this.monitorInput = false;
    this.meters = { ...EMPTY_METERS };
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

  /** Test helper: push one interleaved PCM block and update meters. */
  pushPcm(interleaved: Float32Array): void {
    if (!this.isOpen()) {
      throw new Error('FakeAudioBackend is not open');
    }
    this.applyMeters(interleaved);
    const meta = { channels: this.channelCount, sampleRate: this.sampleRate };
    for (const h of this.pcmHandlers) h(interleaved, meta);
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
      inputCount: this.listInputs().length,
    };
  }

  private isBuiltInInCatalog(deviceId: string): boolean {
    const row = this.catalog.find((d) => d.deviceId === deviceId);
    if (!row) return false;
    return isBuiltInOrPhoneMic(row.label, row.deviceId);
  }

  private emitDevices(): void {
    const inputs = this.listInputs();
    for (const h of this.deviceHandlers) h(inputs);
  }

  private emitGeneratedBlock(): void {
    const frames = 128;
    const ch = this.channelCount;
    const out = new Float32Array(frames * ch);
    const amp = this.amplitude;
    if (amp > 0) {
      for (let i = 0; i < frames; i++) {
        const t = (this.framePhase + i) / this.sampleRate;
        const s = Math.sin(2 * Math.PI * 440 * t) * amp;
        for (let c = 0; c < ch; c++) out[i * ch + c] = s;
      }
      this.framePhase += frames;
    }
    this.pushPcm(out);
  }

  private applyMeters(interleaved: Float32Array): void {
    const ch = this.channelCount;
    const frames = Math.floor(interleaved.length / ch);
    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < frames; i++) {
      const l = Math.abs(interleaved[i * ch]!);
      const r = Math.abs(interleaved[i * ch + Math.min(1, ch - 1)]!);
      if (l > peakL) peakL = l;
      if (r > peakR) peakR = r;
    }
    this.meters = {
      left: peakL,
      right: peakR,
      clipLeft: peakL >= 0.99,
      clipRight: peakR >= 0.99,
    };
  }
}
