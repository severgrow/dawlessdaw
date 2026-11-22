import type { MidiMessage } from '@dawlessdaw/core';
import { isClockLike } from '@dawlessdaw/core';
import {
  DEFAULT_TRACK_CHANNELS,
  FX_CCS,
  MACRO_CCS,
  PROJECT_MIDI_CHANNEL,
  TRACK_CCS,
  decodeProjectProgramChange,
  trackFromChannel,
  type ProjectChangeKind,
} from './midi-map';

export type CircuitGestureClass =
  | 'background'
  | 'sequencer-stream'
  | 'performer-gesture'
  | 'arrangement';

export interface CircuitInterpretation {
  gesture: CircuitGestureClass;
  track: number | null;
  channel: number | null;
  ccName?: string;
  projectIndex?: number;
  projectChangeKind?: ProjectChangeKind;
  /** Focus Engine: treat as strong manual activity */
  focusWorthy: boolean;
  summary: string;
}

const TRACK_CC_BY_NUMBER = new Map(TRACK_CCS.map((c) => [c.cc, c]));

/**
 * Interpret Circuit Rhythm MIDI for arranger / Focus.
 * Sequencer vs pad notes are not distinguishable from the wire alone —
 * dense note streams are classified as sequencer-stream (Inferred).
 */
export class CircuitRhythmInterpreter {
  private noteBuckets = new Map<number, number[]>(); // channel → timestamps
  private readonly streamWindowMs: number;
  private readonly streamThreshold: number;

  constructor(
    private channelMap: Readonly<Record<number, number>> = DEFAULT_TRACK_CHANNELS,
    opts?: { streamWindowMs?: number; streamThreshold?: number },
  ) {
    this.streamWindowMs = opts?.streamWindowMs ?? 400;
    this.streamThreshold = opts?.streamThreshold ?? 4;
  }

  interpret(message: MidiMessage, now = message.timestamp): CircuitInterpretation {
    if (isClockLike(message.kind)) {
      return {
        gesture: 'background',
        track: null,
        channel: null,
        focusWorthy: false,
        summary: `clock:${message.kind}`,
      };
    }

    const channel = message.channel ?? null;

    if (message.kind === 'program-change' && channel === PROJECT_MIDI_CHANNEL) {
      const decoded = decodeProjectProgramChange(message.value ?? 0);
      if (decoded) {
        return {
          gesture: 'arrangement',
          track: null,
          channel,
          projectIndex: decoded.projectIndex,
          projectChangeKind: decoded.kind,
          focusWorthy: false,
          summary: `project ${decoded.projectIndex} (${decoded.kind})`,
        };
      }
    }

    if (message.kind === 'cc' && channel !== null) {
      const cc = message.controller ?? -1;
      const meta = TRACK_CC_BY_NUMBER.get(cc);
      const track = trackFromChannel(channel, this.channelMap);
      if (MACRO_CCS.has(cc) || FX_CCS.has(cc) || meta?.group === 'mixer') {
        return {
          gesture: 'performer-gesture',
          track,
          channel,
          ccName: meta?.name ?? `cc${cc}`,
          focusWorthy: true,
          summary: `cc ${meta?.name ?? cc} ch${channel}`,
        };
      }
      return {
        gesture: 'performer-gesture',
        track,
        channel,
        ccName: meta?.name ?? `cc${cc}`,
        focusWorthy: true,
        summary: `cc ${cc} ch${channel}`,
      };
    }

    if (
      (message.kind === 'note-on' || message.kind === 'note-off') &&
      channel !== null &&
      channel !== PROJECT_MIDI_CHANNEL
    ) {
      const track = trackFromChannel(channel, this.channelMap);
      if (message.kind === 'note-on' && (message.velocity ?? 0) > 0) {
        const dense = this.recordNote(channel, now);
        if (dense) {
          return {
            gesture: 'sequencer-stream',
            track,
            channel,
            focusWorthy: false,
            summary: `seq notes ch${channel} track${track ?? '?'}`,
          };
        }
      }
      return {
        gesture: 'performer-gesture',
        track,
        channel,
        focusWorthy: true,
        summary: `note ${message.note} ch${channel}`,
      };
    }

    if (
      message.kind === 'note-on' &&
      channel === PROJECT_MIDI_CHANNEL &&
      (message.velocity ?? 0) > 0
    ) {
      return {
        gesture: 'performer-gesture',
        track: null,
        channel,
        focusWorthy: true,
        summary: `global sample note ${message.note}`,
      };
    }

    return {
      gesture: 'performer-gesture',
      track: channel ? trackFromChannel(channel, this.channelMap) : null,
      channel,
      focusWorthy: message.kind !== 'note-off',
      summary: message.kind,
    };
  }

  private recordNote(channel: number, now: number): boolean {
    const prev = (this.noteBuckets.get(channel) ?? []).filter(
      (t) => now - t <= this.streamWindowMs,
    );
    prev.push(now);
    this.noteBuckets.set(channel, prev);
    return prev.length >= this.streamThreshold;
  }
}
