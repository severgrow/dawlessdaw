import { clonePattern, emptyStep } from './pattern';
import type { LockGrid } from './generative';
import type { SeqPattern } from './types';

export interface EuclideanSettings {
  track: number;
  hits: number;
  steps: number;
  rotation: number;
}

/** Distribute hits across the selected span and rotate them to the right. */
export function applyEuclideanRhythm(
  pattern: SeqPattern,
  locks: LockGrid,
  settings: EuclideanSettings,
): { pattern: SeqPattern; hits: number; blocked: number } {
  const next = clonePattern(pattern);
  const trackIndex = settings.track - 1;
  const track = next.tracks[trackIndex];
  if (!track) return { pattern, hits: 0, blocked: 0 };
  const steps = Math.max(1, Math.min(pattern.length, Math.round(settings.steps)));
  const hits = Math.max(0, Math.min(steps, Math.round(settings.hits)));
  const rotation = ((Math.round(settings.rotation) % steps) + steps) % steps;
  const pulses = new Set<number>();
  for (let i = 0; i < hits; i++) {
    pulses.add((Math.floor(i * steps / hits) + rotation) % steps);
  }

  let actualHits = 0;
  let blocked = 0;
  for (let i = 0; i < steps; i++) {
    const cell = track.steps[i]!;
    const targetOn = pulses.has(i);
    if (locks[trackIndex]?.[i]) {
      if (cell.on !== targetOn) blocked++;
    } else if (targetOn && !cell.on) {
      track.steps[i] = { ...emptyStep(track.defaultPitch, track.defaultVelocity, track.defaultGate), on: true };
    } else {
      cell.on = targetOn;
    }
    if (track.steps[i]!.on) actualHits++;
  }
  return { pattern: next, hits: actualHits, blocked };
}
