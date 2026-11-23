/**
 * Capture constraint honesty (audio fidelity P4).
 * We request no AGC / NS / AEC and never claim 24-bit from getUserMedia.
 */

export const CAPTURE_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
} as const;

export interface RequestedCaptureSettings {
  echoCancellation: false;
  noiseSuppression: false;
  autoGainControl: false;
  channelCount: 2;
  sampleRate?: number;
  deviceId: string | null;
}

export interface ReportedCaptureSettings {
  /** Values from MediaTrackSettings when available; otherwise null. */
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  channelCount: number | null;
  sampleRate: number | null;
  deviceId: string | null;
}

export interface CaptureSettingsHonesty {
  requested: RequestedCaptureSettings;
  reported: ReportedCaptureSettings;
  /** True when browser applied processing we asked to disable. */
  processingLeak: boolean;
  /**
   * getUserMedia never delivers integer bit-depth PCM into our worklet —
   * we always capture float32 in the AudioWorklet. Never claim 24-bit here.
   */
  sampleFormat: 'float32-worklet';
  notes: string;
}

export function buildCaptureConstraints(
  deviceId: string,
  sampleRate = 48000,
): MediaTrackConstraints {
  return {
    ...CAPTURE_AUDIO_CONSTRAINTS,
    sampleRate,
    deviceId: { exact: deviceId },
  };
}

export function readTrackSettings(track: {
  getSettings: () => MediaTrackSettings;
}): ReportedCaptureSettings {
  const s = track.getSettings();
  return {
    echoCancellation:
      typeof s.echoCancellation === 'boolean' ? s.echoCancellation : null,
    noiseSuppression:
      typeof s.noiseSuppression === 'boolean' ? s.noiseSuppression : null,
    autoGainControl:
      typeof s.autoGainControl === 'boolean' ? s.autoGainControl : null,
    channelCount: typeof s.channelCount === 'number' ? s.channelCount : null,
    sampleRate: typeof s.sampleRate === 'number' ? s.sampleRate : null,
    deviceId: typeof s.deviceId === 'string' ? s.deviceId : null,
  };
}

export function assessCaptureHonesty(
  deviceId: string | null,
  reported: ReportedCaptureSettings,
  requestedSampleRate?: number,
): CaptureSettingsHonesty {
  const requested: RequestedCaptureSettings = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: requestedSampleRate,
    deviceId,
  };
  const processingLeak =
    reported.echoCancellation === true ||
    reported.noiseSuppression === true ||
    reported.autoGainControl === true;

  return {
    requested,
    reported,
    processingLeak,
    sampleFormat: 'float32-worklet',
    notes: processingLeak
      ? 'Browser still enabled echoCancellation / noiseSuppression / autoGainControl despite request — treat meters/levels cautiously.'
      : 'Requested dry capture (no AGC/NS/AEC). Worklet PCM is float32 — not a 24-bit hardware claim.',
  };
}
