/** Session Recorder types — local takes only; never uploaded. */

export type WavBitDepth = 16 | 24 | 32;
export type Mp3Mode = 'cbr320' | 'v0';

export interface TakeMarker {
  /** Sample index (frames, not interleaved) from take start */
  sample: number;
  /** Seconds from take start */
  seconds: number;
  label: string;
  source: 'manual' | 'circuit-project';
}

export interface TakeTags {
  recordedAt: string;
  tempoBpm: number | null;
  circuitProject: number | null;
  studioScene: string | null;
  inputDeviceName: string;
}

export interface TakeMeta {
  id: string;
  name: string;
  createdAt: number;
  sampleRate: number;
  channels: 2;
  /** Total frames (per channel) */
  frameCount: number;
  durationSec: number;
  tags: TakeTags;
  markers: TakeMarker[];
  /** True while a crash/incomplete record may still have chunks */
  incomplete?: boolean;
}

export interface StereoAudio {
  sampleRate: number;
  /** Interleaved LRLR… Float32 −1…1, or separate channels */
  left: Float32Array;
  right: Float32Array;
}

export interface TrimEdit {
  /** Start frame (inclusive) */
  startFrame: number;
  /** End frame (exclusive) */
  endFrame: number;
  fadeInOutMs: number;
  normalize: boolean;
  snapToMarkers: boolean;
}

export interface ExportOptions {
  format: 'wav' | 'mp3';
  wavBitDepth?: WavBitDepth;
  mp3Mode?: Mp3Mode;
  /** Filename without forcing extension */
  filename: string;
  splitAtMarkers: boolean;
  trim: TrimEdit;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  /** Hint when the OS name looks like known gear */
  hint: 'zed' | 'scarlett' | 'sp404' | 'other' | null;
}

export const RECORDER_INPUT_KEY = 'dawlessdaw.recorder.inputDeviceId';
export const RECORDER_MIDI_ARM_KEY = 'dawlessdaw.recorder.midiArm';
export const CLIP_DBFS = -0.3;
/** Linear amplitude for −0.3 dBFS */
export const CLIP_LINEAR = Math.pow(10, CLIP_DBFS / 20);
export const CLIP_HOLD_MS = 2000;
export const DEFAULT_FADE_MS = 10;
export const NORMALIZE_TARGET_DBFS = -1;
export const NORMALIZE_TARGET_LINEAR = Math.pow(10, NORMALIZE_TARGET_DBFS / 20);

export const MP3_LICENCE_NOTICE =
  'MP3 export uses @breezystack/lamejs (LAME), licensed under LGPL-3.0. Source: https://github.com/zhuker/lamejs / https://github.com/breezystack/lamejs. Encoding runs locally in a Web Worker — nothing is uploaded.';
