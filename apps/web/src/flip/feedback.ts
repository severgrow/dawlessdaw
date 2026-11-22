/**
 * Feedback-safe defaults for FLIP capture / playback.
 */
import { FLIP_ALLOW_RESAMPLE_KEY, MONITOR_INPUT_DEFAULT } from './feedbackKeys';

export { MONITOR_INPUT_DEFAULT, FLIP_ALLOW_RESAMPLE_KEY } from './feedbackKeys';

export const PLAYBACK_REENGAGE_WARN =
  'Software playback may re-enter the mix if FLIP out feeds the same interface you are capturing. Prefer headphones or a dry monitor path.';

export const SIMULTANEOUS_BLOCK =
  'Play + Record blocked — would re-capture FLIP playback. Enable Advanced: intentional resample to override.';

export interface FeedbackGate {
  allow: boolean;
  reason: string | null;
  warnPlaybackReentry: boolean;
}

export function loadAllowPlayWhileRec(): boolean {
  try {
    return localStorage.getItem(FLIP_ALLOW_RESAMPLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistAllowPlayWhileRec(on: boolean): void {
  try {
    localStorage.setItem(FLIP_ALLOW_RESAMPLE_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

export function gateRecordWhilePlaying(opts: {
  playing: boolean;
  allowPlayWhileRec: boolean;
  monitorInput: boolean;
}): FeedbackGate {
  const warnPlaybackReentry = opts.monitorInput === true || opts.playing;
  if (opts.playing && !opts.allowPlayWhileRec) {
    return {
      allow: false,
      reason: SIMULTANEOUS_BLOCK,
      warnPlaybackReentry,
    };
  }
  return {
    allow: true,
    reason: null,
    warnPlaybackReentry,
  };
}

export function gatePlayWhileRecording(opts: {
  recording: boolean;
  allowPlayWhileRec: boolean;
}): FeedbackGate {
  if (opts.recording && !opts.allowPlayWhileRec) {
    return {
      allow: false,
      reason: SIMULTANEOUS_BLOCK,
      warnPlaybackReentry: true,
    };
  }
  return { allow: true, reason: null, warnPlaybackReentry: opts.recording };
}

export function defaultMonitorOn(): boolean {
  return MONITOR_INPUT_DEFAULT;
}
