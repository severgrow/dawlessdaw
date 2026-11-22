/** Versioned Dawlessdaw sequencer pattern schema (not Circuit project dumps). */
export const SEQ_SCHEMA_VERSION = 1 as const;

export const SEQ_TRACK_COUNT = 8 as const;
export const SEQ_STEP_COUNT = 16 as const;
export const SEQ_PATTERN_SLOTS = 8 as const;

/** One pad in the 16-step row. */
export interface SeqStep {
  on: boolean;
  /** MIDI note 0–127 */
  pitch: number;
  /** 1–127 when on */
  velocity: number;
  /** Note length as fraction of one step (0.05–1) */
  gate: number;
}

export interface SeqTrack {
  muted: boolean;
  solo: boolean;
  /** Always length 16; playback uses pattern.length */
  steps: SeqStep[];
  /** Default pitch used when toggling a step on */
  defaultPitch: number;
  defaultVelocity: number;
  defaultGate: number;
}

export interface SeqPattern {
  schemaVersion: typeof SEQ_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Active length 1–16 */
  length: number;
  /** Internal-clock BPM when not following Circuit */
  bpm: number;
  tracks: SeqTrack[];
}

export interface SeqBank {
  schemaVersion: typeof SEQ_SCHEMA_VERSION;
  patterns: SeqPattern[];
  activePatternIndex: number;
  /** 'circuit' = follow Circuit Start/Stop/Continue + clock (default). 'internal' = app BPM only; never emits MIDI clock. */
  clockSource: 'circuit' | 'internal';
}

export type SeqClockSource = SeqBank['clockSource'];

export interface SeqScheduledNote {
  track: number; // 1–8
  pitch: number;
  velocity: number;
  /** performance.now()-compatible time to send note-on */
  time: number;
  /** Duration in ms until note-off */
  durationMs: number;
  step: number; // 0-based within pattern length
}

export interface SeqEngineSnapshot {
  bank: SeqBank;
  playing: boolean;
  recording: boolean;
  /** Current step 0..length-1 while playing; -1 when stopped */
  playhead: number;
  undoCount: number;
  redoCount: number;
  /** Last observed Circuit note (monitor only) */
  liveActivity: { track: number; note: number; velocity: number; at: number } | null;
}

export const STORAGE_KEY_SEQUENCER = 'dawlessdaw.sequencer.v1';
