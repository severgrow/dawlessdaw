/**
 * FLIP timing maths — durations, bar boundaries, latency trim.
 * Never silently time-stretches or pitches to fake alignment.
 */
import { stepDurationMs } from '@dawlessdaw/sequencer';
import {
  FLIP_POST_ROLL_MS,
  FLIP_PRE_ROLL_MS,
  FLIP_STEPS_PER_BAR,
  type FlipAlignment,
  type FlipBarCount,
  type FlipConfidence,
  type FlipTrim,
} from './types';

export interface CaptureWindowMs {
  contentMs: number;
  preRollMs: number;
  postRollMs: number;
  totalMs: number;
}

export function barDurationMs(bpm: number, bars: FlipBarCount): number {
  return bars * FLIP_STEPS_PER_BAR * stepDurationMs(bpm);
}

export function planCaptureWindow(bpm: number, bars: FlipBarCount): CaptureWindowMs {
  const contentMs = barDurationMs(bpm, bars);
  return {
    contentMs,
    preRollMs: FLIP_PRE_ROLL_MS,
    postRollMs: FLIP_POST_ROLL_MS,
    totalMs: contentMs + FLIP_PRE_ROLL_MS + FLIP_POST_ROLL_MS,
  };
}

export function framesForMs(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms / 1000) * sampleRate));
}

export function msForFrames(frames: number, sampleRate: number): number {
  return sampleRate > 0 ? (frames / sampleRate) * 1000 : 0;
}

export function buildTrimFromCapture(opts: {
  frameCount: number;
  sampleRate: number;
  bpm: number;
  bars: FlipBarCount;
  captureOffsetMs: number;
  preRollMs?: number;
  postRollMs?: number;
}): FlipTrim {
  const pre = opts.preRollMs ?? FLIP_PRE_ROLL_MS;
  const contentMs = barDurationMs(opts.bpm, opts.bars);
  const contentFrames = framesForMs(contentMs, opts.sampleRate);
  const preFrames = framesForMs(pre, opts.sampleRate);
  const offsetFrames = framesForMs(opts.captureOffsetMs, opts.sampleRate);

  let start = preFrames + offsetFrames;
  if (start < 0) start = 0;
  if (start > opts.frameCount) start = opts.frameCount;

  let end = start + contentFrames;
  if (end > opts.frameCount) end = opts.frameCount;
  if (end < start) end = start;

  return { startFrame: start, endFrame: end };
}

export function expectedContentFrames(
  bpm: number,
  bars: FlipBarCount,
  sampleRate: number,
): number {
  return framesForMs(barDurationMs(bpm, bars), sampleRate);
}

export function isBarBoundary(playhead: number): boolean {
  if (playhead < 0) return false;
  return playhead % FLIP_STEPS_PER_BAR === 0;
}

export interface AlignmentResult {
  alignment: FlipAlignment;
  confidence: FlipConfidence;
  note: string;
}

export function assessAlignment(opts: {
  quantized: boolean;
  clockSource: 'circuit' | 'internal' | 'none';
  captureOffsetMs: number;
  calibrated: boolean;
  trimExact: boolean;
}): AlignmentResult {
  if (!opts.quantized || opts.clockSource === 'none') {
    return {
      alignment: 'unaligned',
      confidence: 'none',
      note: 'Capture was not quantised to a bar boundary. Labelled unaligned — no time-stretch applied.',
    };
  }

  if (opts.captureOffsetMs !== 0) {
    const cal = opts.calibrated ? 'calibrated' : 'estimated';
    const conf: FlipConfidence =
      opts.calibrated && opts.clockSource === 'circuit' && opts.trimExact
        ? 'high'
        : opts.calibrated || opts.clockSource === 'circuit'
          ? 'medium'
          : 'low';
    return {
      alignment: 'offset_applied',
      confidence: conf,
      note: `Capture Offset ${opts.captureOffsetMs.toFixed(1)} ms (${cal}) applied as trim. Web MIDI/audio path is not sample-accurate.`,
    };
  }

  if (opts.clockSource === 'circuit' && opts.trimExact) {
    return {
      alignment: 'aligned',
      confidence: opts.calibrated ? 'high' : 'medium',
      note: 'Started on bar boundary vs Circuit clock. Browser audio path still has unmeasured latency — set Capture Offset if the loop feels late/early.',
    };
  }

  if (opts.clockSource === 'internal') {
    return {
      alignment: 'aligned',
      confidence: 'low',
      note: 'Started on bar boundary vs internal BPM. Main-thread scheduler + getUserMedia latency — treat as approximate.',
    };
  }

  return {
    alignment: 'unknown',
    confidence: 'low',
    note: 'Alignment unknown. No silent pitch/time correction was applied.',
  };
}

export { stepDurationMs };
