/**
 * FLIP lane types — hardware loop capture under the 8 MIDI tracks.
 * Not a 9th Circuit MIDI track. PCM lives in Session Recorder IndexedDB;
 * this schema only stores refs + edit metadata.
 */

import type { WavBitDepth } from '../recorder/types';

/** Capture length in musical bars (4/4 sixteenths × 16). */
export type FlipBarCount = 1 | 2 | 4 | 8;

export type FlipPhase =
  | 'idle'
  | 'armed'
  | 'waiting_boundary'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'cancelled'
  | 'error';

/** Honesty label for loop alignment — never silently time-stretch. */
export type FlipAlignment =
  | 'aligned'
  | 'offset_applied'
  | 'unaligned'
  | 'unknown';

export type FlipConfidence = 'high' | 'medium' | 'low' | 'none';

export const FLIP_STEPS_PER_BAR = 16 as const;
export const FLIP_DEFAULT_BARS: FlipBarCount = 4;
export const FLIP_BAR_OPTIONS: readonly FlipBarCount[] = [1, 2, 4, 8];

/** Extra audio kept around the quantised window (non-destructive trim). */
export const FLIP_PRE_ROLL_MS = 40;
export const FLIP_POST_ROLL_MS = 40;

export const FLIP_STORAGE_KEY = 'dawlessdaw.flip.v1';
export const FLIP_OFFSET_KEY = 'dawlessdaw.flip.captureOffsetMs';
export const FLIP_INPUT_KEY = 'dawlessdaw.flip.inputDeviceId';
export const FLIP_MONITOR_WARN_KEY = 'dawlessdaw.flip.monitorWarned';
export const FLIP_ALLOW_RESAMPLE_KEY = 'dawlessdaw.flip.allowPlayWhileRec';

export const FLIP_SCHEMA_VERSION = 1 as const;

export interface FlipTrim {
  /** Inclusive start frame in stored take PCM */
  startFrame: number;
  /** Exclusive end frame */
  endFrame: number;
}

export interface FlipLatencyProfile {
  deviceId: string;
  deviceLabel: string;
  /** Added to trim start (positive = drop early samples / compensate late path). */
  captureOffsetMs: number;
  /** User-confirmed calibration vs guessed default. */
  calibrated: boolean;
  updatedAt: number;
}

export interface FlipChop {
  /** Equal slice count 4 | 8 | 16 */
  slices: 4 | 8 | 16;
}

/** Compact 16-step mono/choke slice sequencer (Phase B). */
export interface FlipSliceStep {
  /** Slice index 0..slices-1, or -1 = empty */
  slice: number;
}

export interface FlipSliceSeq {
  length: number;
  /** Always 16 slots; playback uses length */
  steps: FlipSliceStep[];
  /** Mono choke: starting a slice stops the previous */
  choke: boolean;
}

export interface FlipClipMeta {
  schemaVersion: typeof FLIP_SCHEMA_VERSION;
  id: string;
  /** Session Recorder take id — PCM in IndexedDB, not JSON */
  takeId: string;
  name: string;
  createdAt: number;
  bars: FlipBarCount;
  bpm: number;
  sampleRate: number;
  frameCount: number;
  inputDeviceId: string | null;
  inputDeviceLabel: string;
  captureOffsetMs: number;
  /** Non-destructive window into the stored take */
  trim: FlipTrim;
  alignment: FlipAlignment;
  confidence: FlipConfidence;
  confidenceNote: string;
  reverse: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  gain: number;
  chop: FlipChop | null;
  sliceSeq: FlipSliceSeq | null;
  clockSource: 'circuit' | 'internal' | 'none';
}

/** MIDI handoff prefs persisted with the FLIP session (Dawlessdaw mute only). */
export interface FlipHandoffPrefs {
  replaceMidiWhilePlaying: boolean;
  /** Tracks 1–8 muted while FLIP loop plays (when replaceMidiWhilePlaying). */
  tracks: number[];
}

/** Lightweight session ref — never embed PCM. */
export interface FlipSessionRef {
  schemaVersion: typeof FLIP_SCHEMA_VERSION;
  activeClipId: string | null;
  clips: FlipClipMeta[];
  bars: FlipBarCount;
  monitorInput: boolean;
  allowPlayWhileRec: boolean;
  handoff: FlipHandoffPrefs;
  updatedAt: number;
}

export interface FlipExportOpts {
  wavBitDepth: Extract<WavBitDepth, 16 | 24>;
  filename: string;
}

export function isFlipBarCount(n: number): n is FlipBarCount {
  return n === 1 || n === 2 || n === 4 || n === 8;
}

export function makeFlipClipId(): string {
  return `flip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultSliceSeq(slices: 4 | 8 | 16): FlipSliceSeq {
  const steps: FlipSliceStep[] = Array.from({ length: 16 }, (_, i) => ({
    slice: i < slices ? i % slices : -1,
  }));
  return { length: 16, steps, choke: true };
}
