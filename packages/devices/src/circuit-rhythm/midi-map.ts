/**
 * Circuit Rhythm MIDI map derived from Novation Programmer's Reference Guide v5
 * and User Guide MIDI appendix. Rhythm ≠ Tracks.
 *
 * Classification: Confirmed from official docs. Live TX behaviour still
 * Hardware-testing-required where noted in docs/hardware-integration/.
 */

export const CIRCUIT_RHYTHM_DOC = {
  programmersReference: 'Circuit Rhythm Programmer’s Reference Guide v5',
  userGuideMidi:
    'https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix',
  syncKb:
    'https://support.novationmusic.com/hc/en-gb/articles/24060538791570-Keeping-multiple-Circuit-Tracks-and-Circuit-Rhythm-s-in-sync',
} as const;

/** Default track → MIDI channel (1–8). Channel 16 reserved for Project. */
export const DEFAULT_TRACK_CHANNELS: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
};

export const PROJECT_MIDI_CHANNEL = 16;

/** Global-channel sample triggers (PRG “Triggering Sample Tracks”). */
export const GLOBAL_SAMPLE_NOTES: Readonly<Record<number, number>> = {
  1: 36,
  2: 38,
  3: 40,
  4: 41,
  5: 43,
  6: 45,
  7: 47,
  8: 48,
};

export interface CcParam {
  cc: number;
  name: string;
  group: 'voice' | 'sampler' | 'mixer' | 'macro' | 'fx' | 'global';
}

/** Per-track CCs (send on track channel 1–8). */
export const TRACK_CCS: readonly CcParam[] = [
  { cc: 8, name: 'SampleChoice', group: 'voice' },
  { cc: 12, name: 'PlaybackMode', group: 'voice' },
  { cc: 14, name: 'Reverse', group: 'voice' },
  { cc: 15, name: 'Choke', group: 'voice' },
  { cc: 16, name: 'Slice', group: 'voice' },
  { cc: 17, name: 'NumberOfSlices', group: 'voice' },
  { cc: 21, name: 'Pitch/Tune', group: 'macro' },
  { cc: 22, name: 'StartCoarse', group: 'macro' },
  { cc: 23, name: 'LengthCoarse', group: 'macro' },
  { cc: 24, name: 'Slope', group: 'macro' },
  { cc: 25, name: 'Distortion', group: 'macro' },
  { cc: 26, name: 'HPF', group: 'macro' },
  { cc: 27, name: 'LPF', group: 'macro' },
  { cc: 28, name: 'Resonance', group: 'macro' },
  { cc: 29, name: 'Level', group: 'mixer' },
  { cc: 30, name: 'Pan', group: 'mixer' },
  { cc: 31, name: 'ReverbSend', group: 'mixer' },
  { cc: 32, name: 'DelaySend', group: 'mixer' },
  { cc: 86, name: 'StartFine', group: 'sampler' },
  { cc: 87, name: 'LengthFine', group: 'sampler' },
];

/** Macro knob CCs (= sampler automatable set). */
export const MACRO_CCS = new Set([21, 22, 23, 24, 25, 26, 27, 28]);

/** FX-related CCs from PRG (often on current context; treat as gesture). */
export const FX_CCS = new Set([
  39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
  59, 60, 61, 62, 63, 64, 65,
]);

export type ProjectChangeKind = 'instant' | 'queued';

export function decodeProjectProgramChange(program: number): {
  projectIndex: number; // 1–64
  kind: ProjectChangeKind;
} | null {
  if (program < 0 || program > 127) return null;
  if (program <= 63) {
    return { projectIndex: program + 1, kind: 'instant' };
  }
  return { projectIndex: program - 64 + 1, kind: 'queued' };
}

export function encodeProjectProgramChange(
  projectIndex: number,
  kind: ProjectChangeKind,
): number {
  const slot = Math.max(1, Math.min(64, projectIndex)) - 1;
  return kind === 'instant' ? slot : slot + 64;
}

export function trackFromChannel(
  channel: number,
  map: Readonly<Record<number, number>> = DEFAULT_TRACK_CHANNELS,
): number | null {
  for (const [track, ch] of Object.entries(map)) {
    if (ch === channel) return Number(track);
  }
  return null;
}
