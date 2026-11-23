/**
 * Circuit MIDI out planner + echo guard (P1).
 *
 * Sends documented Note On/Off on track channels 1–8 only.
 * Never invents button MIDI, SysEx, or a second clock master.
 * Echo guard suppresses Mirror feedback when our notes bounce back on Circuit in.
 *
 * Honesty: experimental / untested until Bench Pass (Note Rx audition).
 */

import { audibleTracks } from './pattern';
import type { SeqPattern } from './types';

export const CIRCUIT_MIDI_OUT_HONESTY = 'experimental' as const;

export const CIRCUIT_MIDI_OUT_DISCLAIMER =
  'Opt-in Note On/Off to Circuit on documented track channels 1–8. Not Guided Record. Not pattern RAM write. Needs Bench.';

/** Documented default: track N → MIDI channel N (PRG). */
export function circuitChannelForTrack(track: number): number | null {
  if (track < 1 || track > 8) return null;
  return track;
}

export interface CircuitNotePlan {
  track: number;
  channel: number;
  note: number;
  velocity: number;
  durationMs: number;
  step: number;
}

/**
 * Plan note-ons for one step of a Splot pattern destined for Circuit.
 * Uses track index as MIDI channel (documented Rhythm map).
 */
export function planCircuitStepNotes(
  pattern: SeqPattern,
  step: number,
  opts?: { stepDurationMs?: number },
): CircuitNotePlan[] {
  const stepMs = opts?.stepDurationMs ?? 125;
  const audible = audibleTracks(pattern);
  const out: CircuitNotePlan[] = [];
  if (step < 0 || step >= pattern.length) return out;
  for (let t = 0; t < 8; t++) {
    if (!audible[t]) continue;
    const st = pattern.tracks[t]?.steps[step];
    if (!st?.on) continue;
    const channel = circuitChannelForTrack(t + 1);
    if (channel == null) continue;
    out.push({
      track: t + 1,
      channel,
      note: Math.max(0, Math.min(127, st.pitch)),
      velocity: Math.max(1, Math.min(127, st.velocity)),
      durationMs: Math.max(20, Math.min(stepMs, stepMs * st.gate)),
      step,
    });
  }
  return out;
}

export interface EchoKey {
  channel: number;
  note: number;
}

/**
 * Suppresses Circuit-in note-ons that match recent Circuit-out sends
 * so Mirror / Intelligence do not treat our audition as a new observation
 * (no MIDI feedback loop into the Live grid).
 */
export class CircuitEchoGuard {
  private readonly windowMs: number;
  private readonly pending = new Map<string, number>();
  private readonly now: () => number;

  constructor(opts?: { windowMs?: number; now?: () => number }) {
    this.windowMs = opts?.windowMs ?? 80;
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  private key(channel: number, note: number): string {
    return `${channel}:${note}`;
  }

  /** Call immediately before/after sending Note On to Circuit out. */
  recordOutbound(channel: number, note: number, at?: number): void {
    this.pending.set(this.key(channel, note), at ?? this.now());
    this.prune(at ?? this.now());
  }

  /**
   * True when an incoming Circuit note should be ignored for Mirror/Intel
   * because we just sent the same note out (echo / local feedback).
   */
  shouldSuppressIncoming(channel: number, note: number, at?: number): boolean {
    const t = at ?? this.now();
    this.prune(t);
    const sent = this.pending.get(this.key(channel, note));
    if (sent === undefined) return false;
    if (t - sent <= this.windowMs) {
      this.pending.delete(this.key(channel, note));
      return true;
    }
    return false;
  }

  clear(): void {
    this.pending.clear();
  }

  private prune(now: number): void {
    for (const [k, t] of this.pending) {
      if (now - t > this.windowMs) this.pending.delete(k);
    }
  }
}

/** Product constraints — never violate these in Circuit out code paths. */
export const CIRCUIT_OUT_FORBIDDEN = {
  sysex: true,
  inventedButtonMidi: true,
  secondClockMaster: true,
  patternRamWrite: true,
  guidedRecordClaim: true,
} as const;
