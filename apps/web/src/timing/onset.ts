/**
 * Pure onset helpers for MIDI→audio Latency Lab.
 * Browser analysis only — no MIDI send here.
 */

export type OnsetConfidence = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface OnsetHit {
  /** Sample index within the capture buffer where onset was detected. */
  sampleIndex: number;
  /** Milliseconds from buffer start. */
  timeMs: number;
  /** Peak magnitude used for the decision. */
  peak: number;
  confidence: OnsetConfidence;
}

export interface LatencySample {
  /** MIDI send time (performance.now). */
  sentAt: number;
  /** Detected onset time (performance.now), or null if missed. */
  onsetAt: number | null;
  latencyMs: number | null;
  confidence: OnsetConfidence;
  note: number;
  channel: number;
}

export interface LatencyStats {
  samples: number;
  hits: number;
  minMs: number | null;
  medianMs: number | null;
  maxMs: number | null;
  meanMs: number | null;
  confidence: OnsetConfidence;
  /** Honest caveat for Patryk. */
  caveat: string;
}

/** RMS of a float window. */
export function windowRms(samples: ArrayLike<number>, start: number, len: number): number {
  const end = Math.min(samples.length, start + len);
  let sum = 0;
  let n = 0;
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sum += v * v;
    n += 1;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * Find first energy onset after `searchFrom` samples.
 * Uses a rising RMS vs a short noise floor — attack time of the sound is included.
 */
export function findOnset(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts?: {
    searchFrom?: number;
    windowMs?: number;
    thresholdMul?: number;
    minFloor?: number;
  },
): OnsetHit | null {
  const windowMs = opts?.windowMs ?? 4;
  const win = Math.max(8, Math.round((sampleRate * windowMs) / 1000));
  const searchFrom = Math.max(0, opts?.searchFrom ?? 0);
  const thresholdMul = opts?.thresholdMul ?? 4;
  const minFloor = opts?.minFloor ?? 0.004;

  // Noise floor from the pre-roll region (or first 20 ms).
  const floorEnd = Math.min(samples.length, Math.max(searchFrom, Math.round(sampleRate * 0.02)));
  let floor = 0;
  let floors = 0;
  for (let i = 0; i + win < floorEnd; i += win) {
    floor += windowRms(samples, i, win);
    floors += 1;
  }
  floor = floors ? floor / floors : minFloor;
  floor = Math.max(floor, minFloor);
  const thresh = floor * thresholdMul;

  for (let i = searchFrom; i + win < samples.length; i += Math.max(1, Math.floor(win / 2))) {
    const rms = windowRms(samples, i, win);
    if (rms >= thresh) {
      const peak = rms;
      const conf: OnsetConfidence =
        rms >= thresh * 2 ? 'High' : rms >= thresh * 1.3 ? 'Medium' : 'Low';
      return {
        sampleIndex: i,
        timeMs: (i / sampleRate) * 1000,
        peak,
        confidence: conf,
      };
    }
  }
  return null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function summarizeLatency(samples: LatencySample[]): LatencyStats {
  const hits = samples.filter((s) => s.latencyMs != null).map((s) => s.latencyMs!);
  const minMs = hits.length ? Math.min(...hits) : null;
  const maxMs = hits.length ? Math.max(...hits) : null;
  const medianMs = median(hits);
  const meanMs = hits.length
    ? Math.round((hits.reduce((a, b) => a + b, 0) / hits.length) * 10) / 10
    : null;

  let confidence: OnsetConfidence = 'Unknown';
  if (hits.length >= 4 && samples.every((s) => s.confidence === 'High' || s.latencyMs == null)) {
    confidence = hits.length === samples.length ? 'High' : 'Medium';
  } else if (hits.length >= 2) {
    confidence = 'Medium';
  } else if (hits.length === 1) {
    confidence = 'Low';
  }

  return {
    samples: samples.length,
    hits: hits.length,
    minMs: minMs != null ? Math.round(minMs * 10) / 10 : null,
    medianMs: medianMs != null ? Math.round(medianMs * 10) / 10 : null,
    maxMs: maxMs != null ? Math.round(maxMs * 10) / 10 : null,
    meanMs,
    confidence,
    caveat:
      'Includes sound attack time + USB/audio path — not pure transport latency. No automatic delay correction. Keep speakers muted / no monitor loop.',
  };
}

export interface LatencyCalibration {
  destination: string;
  audioInputId: string;
  audioInputLabel: string;
  medianMs: number;
  minMs: number;
  maxMs: number;
  samples: number;
  savedAt: string;
  honesty: 'experimental';
}

const CAL_KEY = 'dawlessdaw.timingLab.calibration';

export function loadCalibrations(): LatencyCalibration[] {
  try {
    const raw = localStorage.getItem(CAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LatencyCalibration[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCalibration(cal: LatencyCalibration): LatencyCalibration[] {
  const prev = loadCalibrations().filter(
    (c) => !(c.destination === cal.destination && c.audioInputId === cal.audioInputId),
  );
  const next = [cal, ...prev].slice(0, 12);
  try {
    localStorage.setItem(CAL_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearCalibrations(): void {
  try {
    localStorage.removeItem(CAL_KEY);
  } catch {
    /* ignore */
  }
}
