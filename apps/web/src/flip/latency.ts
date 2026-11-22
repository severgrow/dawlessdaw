/**
 * Per-input Capture Offset for FLIP.
 * Applied as non-destructive trim — never time-stretch / pitch.
 */
import { FLIP_OFFSET_KEY, type FlipLatencyProfile } from './types';

export type OffsetMap = Record<string, FlipLatencyProfile>;

export function loadOffsetMap(): OffsetMap {
  try {
    const raw = localStorage.getItem(FLIP_OFFSET_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OffsetMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveOffsetMap(map: OffsetMap): void {
  try {
    localStorage.setItem(FLIP_OFFSET_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getOffsetForDevice(
  deviceId: string | null,
  map: OffsetMap = loadOffsetMap(),
): FlipLatencyProfile | null {
  if (!deviceId) return null;
  return map[deviceId] ?? null;
}

export function setCaptureOffset(opts: {
  deviceId: string;
  deviceLabel: string;
  captureOffsetMs: number;
  calibrated: boolean;
}): FlipLatencyProfile {
  const map = loadOffsetMap();
  const profile: FlipLatencyProfile = {
    deviceId: opts.deviceId,
    deviceLabel: opts.deviceLabel,
    captureOffsetMs: opts.captureOffsetMs,
    calibrated: opts.calibrated,
    updatedAt: Date.now(),
  };
  map[opts.deviceId] = profile;
  saveOffsetMap(map);
  return profile;
}

export function defaultCaptureOffsetMs(): number {
  return 0;
}

export function clampOffsetMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(-500, Math.min(500, ms));
}
