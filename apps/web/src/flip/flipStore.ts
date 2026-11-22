/**
 * FLIP session persistence — clip meta + takeId refs only (no PCM blobs).
 */
import { DEFAULT_HANDOFF, sanitizeHandoff } from './handoff';
import {
  FLIP_DEFAULT_BARS,
  FLIP_SCHEMA_VERSION,
  FLIP_STORAGE_KEY,
  type FlipBarCount,
  type FlipClipMeta,
  type FlipSessionRef,
  isFlipBarCount,
} from './types';

export function emptyFlipSession(): FlipSessionRef {
  return {
    schemaVersion: FLIP_SCHEMA_VERSION,
    activeClipId: null,
    clips: [],
    bars: FLIP_DEFAULT_BARS,
    monitorInput: false,
    allowPlayWhileRec: false,
    handoff: {
      replaceMidiWhilePlaying: DEFAULT_HANDOFF.replaceMidiWhilePlaying,
      tracks: [...DEFAULT_HANDOFF.tracks],
    },
    updatedAt: Date.now(),
  };
}

function sanitizeClip(raw: unknown): FlipClipMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.takeId !== 'string') return null;
  if (!isFlipBarCount(Number(o.bars))) return null;
  const trim = o.trim as { startFrame?: unknown; endFrame?: unknown } | undefined;
  if (!trim || typeof trim.startFrame !== 'number' || typeof trim.endFrame !== 'number') {
    return null;
  }
  return {
    schemaVersion: FLIP_SCHEMA_VERSION,
    id: o.id,
    takeId: o.takeId,
    name: typeof o.name === 'string' ? o.name : 'FLIP loop',
    createdAt: Number(o.createdAt) || Date.now(),
    bars: o.bars as FlipBarCount,
    bpm: Number(o.bpm) || 120,
    sampleRate: Number(o.sampleRate) || 48000,
    frameCount: Number(o.frameCount) || 0,
    inputDeviceId: typeof o.inputDeviceId === 'string' ? o.inputDeviceId : null,
    inputDeviceLabel: typeof o.inputDeviceLabel === 'string' ? o.inputDeviceLabel : '',
    captureOffsetMs: Number(o.captureOffsetMs) || 0,
    trim: {
      startFrame: Math.max(0, Math.floor(trim.startFrame)),
      endFrame: Math.max(0, Math.floor(trim.endFrame)),
    },
    alignment: (o.alignment as FlipClipMeta['alignment']) || 'unknown',
    confidence: (o.confidence as FlipClipMeta['confidence']) || 'none',
    confidenceNote: typeof o.confidenceNote === 'string' ? o.confidenceNote : '',
    reverse: o.reverse === true,
    fadeInMs: Math.max(0, Number(o.fadeInMs) || 0),
    fadeOutMs: Math.max(0, Number(o.fadeOutMs) || 0),
    gain: Number.isFinite(Number(o.gain)) ? Number(o.gain) : 1,
    chop:
      o.chop && typeof o.chop === 'object' && [4, 8, 16].includes(Number((o.chop as { slices: number }).slices))
        ? { slices: Number((o.chop as { slices: number }).slices) as 4 | 8 | 16 }
        : null,
    sliceSeq:
      o.sliceSeq && typeof o.sliceSeq === 'object'
        ? (o.sliceSeq as FlipClipMeta['sliceSeq'])
        : null,
    clockSource:
      o.clockSource === 'circuit' || o.clockSource === 'internal' || o.clockSource === 'none'
        ? o.clockSource
        : 'none',
  };
}

export function sanitizeSession(raw: unknown): FlipSessionRef {
  const empty = emptyFlipSession();
  if (!raw || typeof raw !== 'object') return empty;
  const o = raw as Record<string, unknown>;
  const clips = Array.isArray(o.clips)
    ? o.clips.map(sanitizeClip).filter((c): c is FlipClipMeta => c != null)
    : [];
  const bars = isFlipBarCount(Number(o.bars)) ? (o.bars as FlipBarCount) : FLIP_DEFAULT_BARS;
  const active =
    typeof o.activeClipId === 'string' && clips.some((c) => c.id === o.activeClipId)
      ? o.activeClipId
      : clips[0]?.id ?? null;
  const handoff = sanitizeHandoff(o.handoff);
  return {
    schemaVersion: FLIP_SCHEMA_VERSION,
    activeClipId: active,
    clips,
    bars,
    monitorInput: o.monitorInput === true,
    allowPlayWhileRec: o.allowPlayWhileRec === true,
    handoff: {
      replaceMidiWhilePlaying: handoff.replaceMidiWhilePlaying,
      tracks: [...handoff.tracks],
    },
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

export function loadFlipSession(): FlipSessionRef {
  try {
    const raw = localStorage.getItem(FLIP_STORAGE_KEY);
    if (!raw) return emptyFlipSession();
    return sanitizeSession(JSON.parse(raw));
  } catch {
    return emptyFlipSession();
  }
}

export function saveFlipSession(session: FlipSessionRef): void {
  try {
    const next: FlipSessionRef = {
      ...session,
      schemaVersion: FLIP_SCHEMA_VERSION,
      updatedAt: Date.now(),
    };
    localStorage.setItem(FLIP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function upsertClip(session: FlipSessionRef, clip: FlipClipMeta): FlipSessionRef {
  const idx = session.clips.findIndex((c) => c.id === clip.id);
  const clips = [...session.clips];
  if (idx >= 0) clips[idx] = clip;
  else clips.unshift(clip);
  return {
    ...session,
    clips,
    activeClipId: clip.id,
    updatedAt: Date.now(),
  };
}

export function removeClip(session: FlipSessionRef, clipId: string): FlipSessionRef {
  const clips = session.clips.filter((c) => c.id !== clipId);
  return {
    ...session,
    clips,
    activeClipId:
      session.activeClipId === clipId ? (clips[0]?.id ?? null) : session.activeClipId,
    updatedAt: Date.now(),
  };
}

export function flipRefsForSessionExport(session: FlipSessionRef): {
  flip: { schemaVersion: number; activeClipId: string | null; clipIds: string[]; takeIds: string[] };
} {
  return {
    flip: {
      schemaVersion: FLIP_SCHEMA_VERSION,
      activeClipId: session.activeClipId,
      clipIds: session.clips.map((c) => c.id),
      takeIds: session.clips.map((c) => c.takeId),
    },
  };
}
