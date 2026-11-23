/**
 * Swappable audio I/O contract (Cross/Nota-inspired — REIMPLEMENT only; no AGPL).
 *
 * Backends:
 * - `worklet` — browser AudioWorklet path (Sessions/FLIP CaptureEngine stays the
 *   production capture owner; this seam does not rewrite take persistence).
 * - `fake` — deterministic headless backend for Vitest.
 * - `native-bridge` — reserved for future desktop I/O (stub elsewhere).
 */

export type AudioBackendKind = 'worklet' | 'fake' | 'native-bridge';

export interface AudioInputInfo {
  deviceId: string;
  label: string;
}

export interface AudioBackendMeters {
  left: number;
  right: number;
  clipLeft: boolean;
  clipRight: boolean;
}

export interface AudioBackendOpenOptions {
  /** Exact input device id — never omit / never default to a built-in mic. */
  deviceId: string;
  sampleRate?: number;
  channelCount?: number;
  /**
   * Speaker monitoring of the live input. Default **false** (no feedback loop).
   * CaptureEngine / FLIP policy unchanged.
   */
  monitorInput?: boolean;
}

export type PcmHandler = (
  interleaved: Float32Array,
  meta: { channels: number; sampleRate: number },
) => void;

export type AudioDeviceChangeHandler = (inputs: AudioInputInfo[]) => void;

/** Immutable view for tests / future graph snapshots. */
export interface AudioBackendSnapshot {
  kind: AudioBackendKind;
  name: string;
  running: boolean;
  open: boolean;
  deviceId: string | null;
  sampleRate: number;
  channelCount: number;
  monitorInput: boolean;
  inputCount: number;
}

export interface AudioBackend {
  readonly name: string;
  readonly kind: AudioBackendKind;
  isAvailable(): boolean;
  /** Inventory after start; always filtered of built-in / Continuity mics. */
  listInputs(): AudioInputInfo[];
  rescanInputs(): Promise<AudioInputInfo[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  open(opts: AudioBackendOpenOptions): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
  getMeters(): AudioBackendMeters;
  getSampleRate(): number;
  getMonitorInput(): boolean;
  onPcm(handler: PcmHandler): () => void;
  onDevicesChanged(handler: AudioDeviceChangeHandler): () => void;
  snapshot(): AudioBackendSnapshot;
}

export const EMPTY_METERS: AudioBackendMeters = {
  left: 0,
  right: 0,
  clipLeft: false,
  clipRight: false,
};

export function createBackendSnapshot(
  backend: Pick<
    AudioBackend,
    | 'kind'
    | 'name'
    | 'listInputs'
    | 'isOpen'
    | 'getSampleRate'
    | 'getMonitorInput'
    | 'snapshot'
  > & {
    running?: boolean;
    deviceId?: string | null;
    channelCount?: number;
  },
  extra: {
    running: boolean;
    deviceId: string | null;
    channelCount: number;
  },
): AudioBackendSnapshot {
  return {
    kind: backend.kind,
    name: backend.name,
    running: extra.running,
    open: backend.isOpen(),
    deviceId: extra.deviceId,
    sampleRate: backend.getSampleRate(),
    channelCount: extra.channelCount,
    monitorInput: backend.getMonitorInput(),
    inputCount: backend.listInputs().length,
  };
}
