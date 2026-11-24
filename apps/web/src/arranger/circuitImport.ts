import type { ParsedPattern } from '@dawlessdaw/devices';
import { CAPTURE_CLOCKS_PER_BAR as TICKS_PER_BAR } from '@dawlessdaw/midi';
import { capRetriggers, type ClipLength, type SongClip } from './song';

const STEP_TICKS = [2, 3, 4, 6, 8, 12, 16, 24];
export const CIRCUIT_RATE_LABELS = ['1/32T', '1/32', '1/16T', '1/16', '1/8T', '1/8', '1/4T', '1/4'];

export function circuitPatternClips(pattern: ParsedPattern, startBar: number): SongClip[] {
  const stepTicks = STEP_TICKS[pattern.rate & 7]!;
  const first = Math.min(pattern.first, pattern.last, 31);
  const last = Math.min(Math.max(pattern.first, pattern.last), 31);
  const steps = pattern.steps.slice(first, last + 1);
  const extent = steps.length * stepTicks;
  const notes = capRetriggers(steps.flatMap((step, index) => {
    if (!step.on || step.note > 127) return [];
    const gate = (step.microHits.length > 1 ? 1 : Math.max(1, step.gate)) * stepTicks / 6;
    return step.microHits.map((micro) => {
      const at = (index * 6 + micro) * stepTicks / 6;
      return { at, end: Math.min(extent, at + gate), pitch: step.note, velocity: Math.max(1, Math.min(127, step.velocity)) };
    });
  }));
  const clips: SongClip[] = [];
  for (let offset = 0; offset < extent;) {
    const bars = (extent - offset) / TICKS_PER_BAR;
    const length: ClipLength = bars > 2 ? 4 : bars > 1 ? 2 : 1;
    const span = length * TICKS_PER_BAR;
    const inClip = notes.filter((note) => note.at >= offset && note.at < offset + span)
      .map((note) => ({ ...note, at: note.at - offset, end: Math.min(span, note.end - offset) }));
    if (inClip.length) {
      clips.push({
        id: crypto.randomUUID(), track: pattern.track + 1,
        bar: startBar + offset / TICKS_PER_BAR, length, notes: inClip,
      });
    }
    offset += span;
  }
  return clips;
}
