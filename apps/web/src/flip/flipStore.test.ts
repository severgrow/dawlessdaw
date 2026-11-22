import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyFlipSession,
  flipRefsForSessionExport,
  loadFlipSession,
  removeClip,
  sanitizeSession,
  saveFlipSession,
  upsertClip,
} from './flipStore';
import { FLIP_STORAGE_KEY, type FlipClipMeta } from './types';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function sampleClip(id = 'flip-1'): FlipClipMeta {
  return {
    schemaVersion: 1,
    id,
    takeId: 'take-abc',
    name: 'FLIP 4 bar',
    createdAt: 1,
    bars: 4,
    bpm: 120,
    sampleRate: 48000,
    frameCount: 384000,
    inputDeviceId: 'dev-1',
    inputDeviceLabel: 'Scarlett',
    captureOffsetMs: 10,
    trim: { startFrame: 1920, endFrame: 385920 },
    alignment: 'offset_applied',
    confidence: 'medium',
    confidenceNote: 'test',
    reverse: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    gain: 1,
    chop: null,
    sliceSeq: null,
    clockSource: 'circuit',
  };
}

describe('FLIP persistence', () => {
  beforeEach(() => {
    (globalThis as { localStorage: Storage }).localStorage = memoryStorage();
  });

  it('round-trips session refs without PCM', () => {
    let s = emptyFlipSession();
    s = upsertClip(s, sampleClip());
    saveFlipSession(s);
    const loaded = loadFlipSession();
    expect(loaded.activeClipId).toBe('flip-1');
    expect(loaded.clips[0]?.takeId).toBe('take-abc');
    expect(JSON.stringify(loaded)).not.toMatch(/Float32|pcm/i);
    const raw = localStorage.getItem(FLIP_STORAGE_KEY)!;
    expect(raw.length).toBeLessThan(5000);
  });

  it('sanitize drops corrupt clips', () => {
    const s = sanitizeSession({
      schemaVersion: 1,
      clips: [{ id: 'bad' }, sampleClip('ok')],
      bars: 4,
    });
    expect(s.clips).toHaveLength(1);
    expect(s.clips[0]!.id).toBe('ok');
  });

  it('session export exposes takeId refs only', () => {
    const s = upsertClip(emptyFlipSession(), sampleClip());
    const refs = flipRefsForSessionExport(s);
    expect(refs.flip.takeIds).toEqual(['take-abc']);
    expect(refs.flip.clipIds).toEqual(['flip-1']);
  });

  it('removeClip updates active id', () => {
    let s = upsertClip(emptyFlipSession(), sampleClip('a'));
    s = upsertClip(s, sampleClip('b'));
    s = removeClip(s, 'b');
    expect(s.activeClipId).toBe('a');
  });
});
