import { describe, expect, it } from 'vitest';
import type { StereoAudio } from '../recorder/types';
import {
  applyLatencyToSample,
  beginMidiCapture,
  hardwareLabelForChannel,
  pushMidiNoteOn,
  refineGuidedSlices,
  refineSliceStart,
  suggestGridSlices,
  suggestMidiSlices,
  suggestSlicesForMode,
} from './midiGuide';

function impulseAt(frame: number, n = 1000): StereoAudio {
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  left[frame] = 0.9;
  right[frame] = 0.9;
  if (frame > 0) {
    left[frame - 1] = 0.05;
    right[frame - 1] = 0.05;
  }
  return { sampleRate: 1000, left, right };
}

describe('midiGuide', () => {
  it('captures note-ons relative to session start', () => {
    const s = beginMidiCapture({ startedAtMs: 1000, sampleRate: 1000 });
    const ev = pushMidiNoteOn(s, {
      atMs: 1500,
      channel: 1,
      note: 36,
      velocity: 100,
      label: 'T1 → MPC',
    });
    expect(ev).not.toBeNull();
    expect(ev!.atMs).toBe(500);
    expect(ev!.sample).toBe(500);
    expect(pushMidiNoteOn(s, { atMs: 1600, channel: 1, note: 36, velocity: 0, label: 'x' })).toBeNull();
  });

  it('suggests grid and midi slices without zero length', () => {
    const grid = suggestGridSlices({ startFrame: 0, endFrame: 800, slices: 8 });
    expect(grid).toHaveLength(8);
    for (const s of grid) expect(s.endFrame).toBeGreaterThan(s.startFrame);

    const session = beginMidiCapture({ startedAtMs: 0, sampleRate: 1000 });
    pushMidiNoteOn(session, { atMs: 100, channel: 1, note: 36, velocity: 80, label: 'A' });
    pushMidiNoteOn(session, { atMs: 400, channel: 1, note: 38, velocity: 80, label: 'B' });
    const midi = suggestMidiSlices({
      events: session.events,
      startFrame: 0,
      endFrame: 800,
      sampleRate: 1000,
      latencyMs: 0,
      frameCount: 800,
    });
    expect(midi).toHaveLength(2);
    expect(midi[0]!.label).toBe('A');
    expect(midi[0]!.endFrame).toBe(400);
  });

  it('applies latency shift and refines toward onset', () => {
    expect(applyLatencyToSample(100, 50, 1000, 1000)).toBe(150);
    const audio = impulseAt(200);
    const start = refineSliceStart({
      audio,
      frame: 210,
      searchMs: 30,
      preMarginMs: 5,
      endLimit: 500,
    });
    expect(start).toBeLessThanOrEqual(200);
    expect(start).toBeGreaterThanOrEqual(190);

    const refined = refineGuidedSlices(
      [{ id: '1', startFrame: 210, endFrame: 400, source: 'midi', label: 'hit', midiEventId: null }],
      audio,
      { searchMs: 30, preMarginMs: 5, fadeHintMs: 8 },
    );
    expect(refined[0]!.source).toBe('refined');
    expect(refined[0]!.endFrame).toBeGreaterThan(refined[0]!.startFrame);
  });

  it('hardware labels stay contextual', () => {
    expect(
      hardwareLabelForChannel(1, [{ dest: { device: 'mpc', slot: 1 } }], { mpc: 'Akai MPC One' }),
    ).toContain('MPC');
    expect(hardwareLabelForChannel(2, [{ dest: null }, { dest: null }], {})).toContain(
      'unassigned',
    );
  });

  it('mode dispatcher returns grid by default', () => {
    const slices = suggestSlicesForMode({
      mode: 'grid',
      events: [],
      startFrame: 0,
      endFrame: 160,
      sampleRate: 48000,
      latencyMs: 0,
      frameCount: 160,
      gridSlices: 4,
    });
    expect(slices).toHaveLength(4);
  });
});
