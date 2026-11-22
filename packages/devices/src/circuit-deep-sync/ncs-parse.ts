/**
 * Parse Circuit Rhythm session (.ncs) pattern blobs.
 *
 * Layout reverse-mapped from Circuit Remix `tools/rm_app.html`
 * (`SESS_SIZE`, `PAT0`, `PAT`, `patParse`, `patCells`) — saved project files,
 * not a live USB sequencer dump.
 */

import type { ParsedPattern, ParsedSession, PatternAutomationLane, PatternStep } from './types';

export const NCS_SESS_SIZE = 0x29484;
export const NCS_PAT0 = 0x2e4;
export const NCS_PAT = 0xA28;
export const NCS_NPATS = 64;
export const NCS_NSTEPS = 32;
export const NCS_STEP = 8;
export const NCS_SETT = 0x100;
export const NCS_LANE0 = 0x128;
export const NCS_NLANES = 12;
export const NCS_LANE_BYTES = 192; // 32 steps × 6 micro positions

const STEP_EMPTY_MASK = 0;

function latin(b: Uint8Array, a: number, n: number): string {
  let s = '';
  for (let i = a; i < a + n; i++) s += String.fromCharCode(b[i]!);
  return s.replace(/[\s\0]+$/g, '');
}

function isFF(b: Uint8Array, a: number, n: number): boolean {
  for (let i = a; i < a + n; i++) if (b[i] !== 0xff) return false;
  return true;
}

export function isNcsSession(bytes: Uint8Array): boolean {
  if (bytes.length !== NCS_SESS_SIZE) return false;
  const head = latin(bytes, 0, 4);
  return head === 'RUSE' || head === 'RDEM';
}

export function patOff(slot: number): number {
  return NCS_PAT0 + NCS_PAT * slot;
}

function parseStep(b: Uint8Array, index: number): PatternStep {
  const o = index * NCS_STEP;
  const mask = b[o + 2]!;
  const microHits: number[] = [];
  for (let k = 0; k < 6; k++) if ((mask >> k) & 1) microHits.push(k);
  return {
    index,
    on: mask !== STEP_EMPTY_MASK,
    note: b[o]!,
    gate: b[o + 1]!,
    mask,
    velocity: b[o + 3]!,
    probability: b[o + 4]!,
    flip: b[o + 5]!,
    tie: (b[o + 6]! & 1) === 1,
    microHits,
  };
}

function parseLanes(b: Uint8Array): PatternAutomationLane[] {
  const lanes: PatternAutomationLane[] = [];
  for (let k = 0; k < NCS_NLANES; k++) {
    const start = NCS_LANE0 + NCS_LANE_BYTES * k;
    const slice = Array.from(b.subarray(start, start + NCS_LANE_BYTES));
    lanes.push({
      index: k,
      bytes: slice,
      hasData: !isFF(b, start, NCS_LANE_BYTES),
    });
  }
  return lanes;
}

/** Parse one 0xA28 pattern region (or longer buffer starting at pattern). */
export function parsePatternBytes(raw: Uint8Array, slot: number): ParsedPattern {
  const b = raw.length >= NCS_PAT ? raw.subarray(0, NCS_PAT) : raw;
  const steps: PatternStep[] = [];
  for (let s = 0; s < NCS_NSTEPS; s++) steps.push(parseStep(b, s));
  const lanes = parseLanes(b);
  const noteCount = steps.filter((st) => st.on).length;
  const laneCount = lanes.filter((l) => l.hasData).length;
  return {
    track: slot >> 3,
    pattern: slot & 7,
    slot,
    steps,
    last: b[NCS_SETT] ?? 0,
    first: b[NCS_SETT + 1] ?? 0,
    rate: b[NCS_SETT + 2] ?? 0,
    dir: b[NCS_SETT + 3] ?? 0,
    order: b[NCS_SETT + 7] ?? 0,
    lanes,
    noteCount,
    empty: noteCount === 0 && laneCount === 0,
  };
}

export function parseNcsSession(
  bytes: Uint8Array,
  source: ParsedSession['source'] = 'local-ncs',
): ParsedSession {
  if (!isNcsSession(bytes)) {
    throw new Error(
      `Not a Circuit Rhythm session (.ncs): need ${NCS_SESS_SIZE} bytes with RUSE/RDEM head`,
    );
  }
  const patterns: ParsedPattern[] = [];
  for (let n = 0; n < NCS_NPATS; n++) {
    const o = patOff(n);
    patterns.push(parsePatternBytes(bytes.subarray(o, o + NCS_PAT), n));
  }
  return {
    source,
    header: latin(bytes, 0, 4),
    byteLength: bytes.length,
    patterns,
    lane: 'saved-project-file',
    disclaimer:
      'Parsed from a saved project/session file (.ncs). This is NOT live internal sequencer RAM. Unsaved edits on the device are not present.',
  };
}

/** Summarize non-empty patterns for UI / reports. */
export function summarizeSession(session: ParsedSession): {
  nonEmpty: number;
  byTrack: { track: number; patterns: number; notes: number }[];
} {
  const byTrack = Array.from({ length: 8 }, (_, track) => {
    const pats = session.patterns.filter((p) => p.track === track && !p.empty);
    return {
      track,
      patterns: pats.length,
      notes: pats.reduce((a, p) => a + p.noteCount, 0),
    };
  });
  return {
    nonEmpty: session.patterns.filter((p) => !p.empty).length,
    byTrack,
  };
}
