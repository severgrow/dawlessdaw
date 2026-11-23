import type { PortId } from '@dawlessdaw/core';
import {
  barDurationMs,
  CAPTURE_CLOCKS_PER_BAR,
  isClockConfidentForBars,
  type CaptureClockHint,
  type RecordedMidiEvent,
} from '@dawlessdaw/midi';
import { clonePattern, emptyStep, type SeqPattern } from '@dawlessdaw/sequencer';

export interface CapturedPatternBar {
  label: string;
  pattern: SeqPattern;
  notes: number;
  collisions: number;
  estimatedGates: number;
  clippedGates: number;
}

export function circuitPatternBars(
  events: readonly RecordedMidiEvent[],
  port: PortId,
  bars: number,
  clock: CaptureClockHint,
  now: number,
  base: SeqPattern,
): { aligned: boolean; bars: CapturedPatternBar[] } {
  const circuit = events.filter((event) =>
    event.source.kind === 'incoming' && event.source.portId === port && event.atMs <= now,
  );
  const currentRun = circuit.slice(circuit.map((event) => event.kind).lastIndexOf('start') + 1);
  const tick = clock.position?.tickCount ?? 0;
  // Complete musical bars only. An unfinished first bar uses the labelled wall-time fallback.
  const aligned = isClockConfidentForBars(clock) && tick >= CAPTURE_CLOCKS_PER_BAR &&
    currentRun.some((event) => event.kind === 'note-on' && event.position?.transport === 'playing');
  const completedBars = Math.floor(tick / CAPTURE_CLOCKS_PER_BAR);
  const span = aligned ? CAPTURE_CLOCKS_PER_BAR : barDurationMs(clock.bpm ?? base.bpm);
  const end = aligned ? completedBars * span : now;
  const selectedBars = Math.min(aligned ? completedBars : bars, bars);
  const position = (event: RecordedMidiEvent): number | undefined =>
    aligned ? event.position?.tickCount : event.atMs;

  // Pair releases before projecting onto steps so releases just outside a bar still count.
  const pending = new Map<string, { on: RecordedMidiEvent; off?: RecordedMidiEvent }>();
  const notes: { on: RecordedMidiEvent; off?: RecordedMidiEvent }[] = [];
  for (const event of aligned ? currentRun : circuit) {
    if (event.kind === 'start' || event.kind === 'stop') {
      pending.clear();
      continue;
    }
    if (event.channel == null || event.channel < 1 || event.channel > 8 || event.note == null) continue;
    const key = `${event.channel}:${event.note}`;
    if (event.kind === 'note-on' && (event.velocity ?? 0) > 0) {
      if (aligned && event.position?.transport !== 'playing') continue;
      const pair = { on: event };
      notes.push(pair);
      pending.set(key, pair);
    } else if (event.kind === 'note-off' || event.kind === 'note-on') {
      const pair = pending.get(key);
      if (pair) pair.off = event;
      pending.delete(key);
    }
  }

  return {
    aligned,
    bars: Array.from({ length: selectedBars }, (_, index) => {
      const start = end - (selectedBars - index) * span;
      const stepSize = span / 16;
      const pattern = clonePattern(base);
      pattern.name = 'Circuit capture';
      pattern.length = 16;
      pattern.bpm = Math.round(Math.max(40, Math.min(300, clock.bpm ?? base.bpm)));
      for (const track of pattern.tracks) {
        track.steps = track.steps.map(() =>
          emptyStep(track.defaultPitch, track.defaultVelocity, track.defaultGate),
        );
      }

      let collisions = 0;
      let noteCount = 0;
      let estimatedGates = 0;
      let clippedGates = 0;
      for (const { on, off } of notes) {
        const at = position(on);
        if (at == null || at < start || at >= start + span) continue;
        const stepIndex = Math.min(15, Math.round((at - start) / stepSize));
        const track = pattern.tracks[on.channel! - 1]!;
        const step = track.steps[stepIndex]!;
        // One note per track/step. Keep the first observed onset in a collision.
        if (step.on) {
          collisions++;
          continue;
        }
        const release = off && position(off);
        const duration = release != null ? (release - at) / stepSize : null;
        const useWallGate = duration === 0 && aligned && off != null;
        const observedGate = useWallGate
          ? (off.atMs - on.atMs) / (barDurationMs(clock.bpm ?? base.bpm) / 16)
          : duration;
        step.on = true;
        step.pitch = on.note!;
        step.velocity = on.velocity!;
        step.gate = observedGate == null
          ? track.defaultGate
          : Math.max(0.05, Math.min(1, observedGate));
        noteCount++;
        if (observedGate == null) estimatedGates++;
        else if (observedGate > 1 || observedGate < 0.05) clippedGates++;
      }

      return {
        label: aligned ? `Bar ${completedBars - selectedBars + index + 1}` : `Window ${index + 1}`,
        pattern,
        notes: noteCount,
        collisions,
        estimatedGates,
        clippedGates,
      };
    }),
  };
}
