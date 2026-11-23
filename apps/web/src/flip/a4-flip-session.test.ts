/**
 * A4 — FLIP + Session reliability (simulated).
 * Interruption/recovery, feedback gates, clip restore, mute handoff safety,
 * error paths without throw. Built-in Mac/iPhone mics stay excluded from inputs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterSelectableAudioInputs,
  isBuiltInOrPhoneMic,
  pickPreferredInputId,
  PLUG_IN_INTERFACE,
} from '../recorder/devices';
import { assembleRecoveredTake, type DraftState } from '../recorder/takeStore';
import type { TakeMeta } from '../recorder/types';
import {
  MONITOR_INPUT_DEFAULT,
  gatePlayWhileRecording,
  gateRecordWhilePlaying,
} from './feedback';
import {
  applyHandoffMutes,
  restoreHandoffMutes,
  sanitizeHandoff,
} from './handoff';
import {
  emptyFlipSession,
  loadFlipSession,
  saveFlipSession,
  upsertClip,
} from './flipStore';
import {
  armWaiting,
  canCancel,
  initialFlipMachine,
  transition,
} from './stateMachine';
import type { FlipClipMeta } from './types';

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

function sampleClip(id = 'flip-a4'): FlipClipMeta {
  return {
    schemaVersion: 1,
    id,
    takeId: 'take-a4',
    name: 'FLIP A4',
    createdAt: 1,
    bars: 4,
    bpm: 120,
    sampleRate: 48000,
    frameCount: 384000,
    inputDeviceId: 'scarlett',
    inputDeviceLabel: 'Scarlett 2i2',
    captureOffsetMs: 0,
    trim: { startFrame: 0, endFrame: 384000 },
    alignment: 'aligned',
    confidence: 'medium',
    confidenceNote: 'a4',
    reverse: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    gain: 1,
    chop: null,
    sliceSeq: null,
    clockSource: 'circuit',
  };
}

function draftMeta(): TakeMeta {
  return {
    id: 'take-draft-1',
    name: 'jam 1200',
    createdAt: 1,
    sampleRate: 48000,
    frameCount: 0,
    durationSec: 0,
    channels: 2,
    incomplete: true,
    markers: [],
    tags: {
      recordedAt: '2026-11-23T00:00:00.000Z',
      tempoBpm: 120,
      circuitProject: null,
      studioScene: null,
      inputDeviceName: 'Scarlett 2i2',
    },
  };
}

describe('A4 FLIP + Session reliability', () => {
  beforeEach(() => {
    (globalThis as { localStorage: Storage }).localStorage = memoryStorage();
  });

  // ── Interruption / recovery ──────────────────────────────────────

  it('state machine: cancel mid-record returns to cancelled without throw', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    s = armWaiting(s);
    s = transition(s, { type: 'BOUNDARY' });
    expect(s.phase).toBe('recording');
    expect(canCancel(s.phase)).toBe(true);
    expect(() => {
      s = transition(s, { type: 'CANCEL' });
    }).not.toThrow();
    expect(s.phase).toBe('cancelled');
    s = transition(s, { type: 'CLEAR' });
    expect(s.phase).toBe('idle');
  });

  it('state machine: disarm while waiting boundary aborts cleanly', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    s = armWaiting(s);
    expect(s.phase).toBe('waiting_boundary');
    s = transition(s, { type: 'DISARM' });
    expect(s.phase).toBe('idle');
  });

  it('assembles recovered take from draft chunks (interrupted capture)', () => {
    const draft: DraftState = {
      id: 'active',
      takeId: 'take-draft-1',
      meta: draftMeta(),
      nextChunkIndex: 2,
      startedAt: 1,
    };
    // 2 frames + 1 frame stereo interleaved
    const chunks = [
      { index: 0, samples: new Float32Array([0.1, -0.1, 0.2, -0.2]) },
      { index: 1, samples: new Float32Array([0.3, -0.3]) },
    ];
    const recovered = assembleRecoveredTake(draft, chunks);
    expect(recovered).not.toBeNull();
    expect(recovered!.meta.incomplete).toBe(true);
    expect(recovered!.meta.name).toContain('(recovered)');
    expect(recovered!.audio.left.length).toBe(3);
    expect(recovered!.audio.left[2]).toBeCloseTo(0.3, 5);
  });

  it('recovery returns null on empty or gapped chunks (no crash)', () => {
    const draft: DraftState = {
      id: 'active',
      takeId: 'take-draft-1',
      meta: draftMeta(),
      nextChunkIndex: 0,
      startedAt: 1,
    };
    expect(assembleRecoveredTake(draft, [])).toBeNull();
    expect(
      assembleRecoveredTake(draft, [
        { index: 0, samples: new Float32Array([0, 0]) },
        { index: 2, samples: new Float32Array([1, 1]) },
      ]),
    ).toBeNull();
  });

  // ── Clip restore ─────────────────────────────────────────────────

  it('FLIP session survives simulated reload (clip refs restored)', () => {
    let s = emptyFlipSession();
    s = upsertClip(s, sampleClip('clip-1'));
    s = upsertClip(s, sampleClip('clip-2'));
    saveFlipSession(s);

    // Simulate app restart: new load from same storage
    const restored = loadFlipSession();
    expect(restored.clips).toHaveLength(2);
    expect(restored.activeClipId).toBe('clip-2');
    expect(restored.clips[0]!.takeId).toBe('take-a4');
    expect(restored.handoff.replaceMidiWhilePlaying).toBe(false);
  });

  // ── Feedback loops ───────────────────────────────────────────────

  it('blocks play+record feedback unless intentional resample; monitor default OFF', () => {
    expect(MONITOR_INPUT_DEFAULT).toBe(false);
    expect(
      gateRecordWhilePlaying({
        playing: true,
        allowPlayWhileRec: false,
        monitorInput: false,
      }).allow,
    ).toBe(false);
    expect(
      gatePlayWhileRecording({ recording: true, allowPlayWhileRec: false }).allow,
    ).toBe(false);
    expect(
      gateRecordWhilePlaying({
        playing: true,
        allowPlayWhileRec: true,
        monitorInput: true,
      }).warnPlaybackReentry,
    ).toBe(true);
  });

  // ── MIDI mute handoff safety ─────────────────────────────────────

  it('handoff mutes restore after interrupt even if one setMute throws', () => {
    const state: Record<number, boolean> = { 1: false, 2: false, 3: false };
    const setMute = vi.fn((track: number, muted: boolean) => {
      if (track === 2 && muted === false) throw new Error('boom');
      state[track] = muted;
    });
    const snap = applyHandoffMutes([1, 2, 3], (t) => state[t] === true, setMute);
    expect(state[1]).toBe(true);
    expect(state[3]).toBe(true);

    expect(() => restoreHandoffMutes(snap, setMute)).not.toThrow();
    expect(state[1]).toBe(false);
    // track 2 failed on restore — left muted; others still restored
    expect(state[3]).toBe(false);
  });

  it('double restore is safe; handoff stays off by default', () => {
    expect(sanitizeHandoff(undefined).replaceMidiWhilePlaying).toBe(false);
    const state: Record<number, boolean> = { 1: false };
    const setMute = vi.fn((t: number, m: boolean) => {
      state[t] = m;
    });
    const snap = applyHandoffMutes([1], () => false, setMute);
    restoreHandoffMutes(snap, setMute);
    restoreHandoffMutes(snap, setMute);
    expect(state[1]).toBe(false);
    expect(setMute.mock.calls.filter((c) => c[0] === 1 && c[1] === false).length).toBe(2);
  });

  // ── Error paths ──────────────────────────────────────────────────

  it('process fail and ERROR events leave machine in error without throwing', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    s = transition(s, { type: 'START_REC' });
    s = transition(s, { type: 'STOP_REC' });
    expect(() => {
      s = transition(s, { type: 'PROCESS_FAIL', message: 'disk full' });
    }).not.toThrow();
    expect(s.phase).toBe('error');
    expect(s.error).toBe('disk full');

    s = transition(s, { type: 'ARM' });
    expect(() => {
      s = transition(s, { type: 'ERROR', message: 'Missing take audio' });
    }).not.toThrow();
    expect(s.phase).toBe('error');
    expect(s.error).toBe('Missing take audio');
  });

  it('illegal transitions are no-ops (no crash)', () => {
    const idle = initialFlipMachine();
    expect(transition(idle, { type: 'STOP_REC' }).phase).toBe('idle');
    expect(transition(idle, { type: 'PROCESS_DONE' }).phase).toBe('idle');
    expect(transition(idle, { type: 'BOUNDARY' }).phase).toBe('idle');
  });

  // ── Built-in mic exclusion (FLIP / Sessions inputs) ──────────────

  it('never selects MacBook / iPhone / Continuity mics for capture', () => {
    expect(isBuiltInOrPhoneMic('MacBook Pro Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('iPhone Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Continuity Microphone')).toBe(true);
    const onlyBuiltIn = filterSelectableAudioInputs([
      { deviceId: 'default', label: 'Default - MacBook Pro Microphone' },
      { deviceId: 'mb', label: 'MacBook Air Microphone' },
    ]);
    expect(onlyBuiltIn).toEqual([]);
    expect(pickPreferredInputId(onlyBuiltIn)).toBeNull();
    expect(PLUG_IN_INTERFACE).toMatch(/plug in/i);

    const mixed = filterSelectableAudioInputs([
      { deviceId: 'mb', label: 'MacBook Pro Microphone' },
      { deviceId: 'scar', label: 'Scarlett 2i2' },
    ]);
    expect(pickPreferredInputId(mixed)).toBe('scar');
  });
});
