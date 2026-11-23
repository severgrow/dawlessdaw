/**
 * Live observation reconstruction on Circuit Mirror foundation.
 *
 * Maps Mirror cells → honesty-labelled observation grid.
 * This is NOT a dump of Circuit internal pattern RAM — only performance MIDI inference.
 *
 *   observed — Mirror bright (confirmed across loops)
 *   inferred — Mirror dim (heard once / fading)
 *   empty    — never heard (or faded out)
 */

import {
  MIRROR_STEP_COUNT,
  MIRROR_TRACK_COUNT,
  type CircuitMirrorSnapshot,
  type MirrorCell,
  type MirrorCellKind,
} from './circuit-mirror';
import { clonePattern, createPattern } from './pattern';
import type { SeqPattern, SeqStep } from './types';

export type ObservationKind = 'observed' | 'inferred' | 'empty';

export interface ObservationCell {
  kind: ObservationKind;
  note: number;
  velocity: number;
}

export interface ObservationGrid {
  honesty: 'experimental';
  disclaimer: string;
  length: number;
  tracks: ObservationCell[][];
  /** true when any cell is non-empty */
  hasContent: boolean;
}

export const OBSERVATION_DISCLAIMER =
  'Reconstructed from Circuit performance MIDI (notes + clock). Not Circuit pattern RAM. Experimental until Bench.';

function emptyObs(): ObservationCell {
  return { kind: 'empty', note: 60, velocity: 0 };
}

/** Map Mirror cell kind → observation honesty label. */
export function mirrorKindToObservation(kind: MirrorCellKind): ObservationKind {
  if (kind === 'bright') return 'observed';
  if (kind === 'dim') return 'inferred';
  return 'empty';
}

export function observationFromMirrorCell(cell: MirrorCell): ObservationCell {
  const kind = mirrorKindToObservation(cell.kind);
  if (kind === 'empty') return emptyObs();
  return {
    kind,
    note: cell.note,
    velocity: cell.velocity,
  };
}

/** Build observation grid from a Circuit Mirror snapshot (Live or Saved-as-mirror). */
export function observationFromMirror(
  snap: Pick<CircuitMirrorSnapshot, 'tracks' | 'length'>,
): ObservationGrid {
  const length = Math.max(1, Math.min(MIRROR_STEP_COUNT, snap.length));
  const tracks: ObservationCell[][] = [];
  let hasContent = false;
  for (let t = 0; t < MIRROR_TRACK_COUNT; t++) {
    const row: ObservationCell[] = [];
    for (let s = 0; s < MIRROR_STEP_COUNT; s++) {
      const cell = snap.tracks[t]?.[s];
      const obs = cell ? observationFromMirrorCell(cell) : emptyObs();
      if (obs.kind !== 'empty' && s < length) hasContent = true;
      row.push(obs);
    }
    tracks.push(row);
  }
  return {
    honesty: 'experimental',
    disclaimer: OBSERVATION_DISCLAIMER,
    length,
    tracks,
    hasContent,
  };
}

function stepFromObs(cell: ObservationCell, fallbackPitch: number): SeqStep {
  if (cell.kind === 'empty') {
    return { on: false, pitch: fallbackPitch, velocity: 100, gate: 0.85 };
  }
  return {
    on: true,
    pitch: Math.max(0, Math.min(127, cell.note)),
    velocity: Math.max(1, Math.min(127, cell.velocity || 100)),
    gate: 0.85,
  };
}

/**
 * Convert observation → Splot SeqPattern (software grid source).
 * Includes inferred cells (dim) so sparse first-loop captures still seed generate.
 */
export function patternFromObservation(
  grid: ObservationGrid,
  opts?: { name?: string; bpm?: number; includeInferred?: boolean },
): SeqPattern {
  const includeInferred = opts?.includeInferred !== false;
  const base = createPattern(1, opts?.bpm ?? 120);
  const next = clonePattern(base);
  next.name = opts?.name ?? 'Observed Circuit';
  next.length = grid.length;
  for (let t = 0; t < MIRROR_TRACK_COUNT; t++) {
    const track = next.tracks[t]!;
    for (let s = 0; s < MIRROR_STEP_COUNT; s++) {
      const cell = grid.tracks[t]?.[s] ?? emptyObs();
      if (cell.kind === 'inferred' && !includeInferred) {
        track.steps[s] = {
          on: false,
          pitch: track.defaultPitch,
          velocity: track.defaultVelocity,
          gate: track.defaultGate,
        };
        continue;
      }
      track.steps[s] = stepFromObs(cell, track.defaultPitch);
      if (track.steps[s]!.on) {
        track.defaultPitch = track.steps[s]!.pitch;
      }
    }
  }
  return next;
}

/** Convenience: Mirror snapshot → SeqPattern in one step. */
export function patternFromMirror(
  snap: Pick<CircuitMirrorSnapshot, 'tracks' | 'length'>,
  opts?: { name?: string; bpm?: number; includeInferred?: boolean },
): SeqPattern {
  return patternFromObservation(observationFromMirror(snap), opts);
}
