/**
 * Simulated FLIP smoke: capture window → process/preview maths → chop → WAV export.
 */
import { describe, it, expect } from 'vitest';
import { encodeWav, parseWavHeader } from '../recorder/wav';
import type { StereoAudio } from '../recorder/types';
import { transition, initialFlipMachine, armWaiting } from './stateMachine';
import {
  assessAlignment,
  buildTrimFromCapture,
  expectedContentFrames,
  planCaptureWindow,
} from './timing';
import { chopEqual, renderFlipAudio } from './process';
import { defaultFlipFilename } from './exportFlip';
import type { FlipClipMeta } from './types';
import { FLIP_PRE_ROLL_MS, FLIP_POST_ROLL_MS } from './types';

function toneLoop(frames: number, sampleRate: number, freq = 220): StereoAudio {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const s = 0.4 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    left[i] = s;
    right[i] = s * 0.9;
  }
  return { sampleRate, left, right };
}

describe('FLIP smoke capture→preview→chop→export', () => {
  it('simulates a quantised 4-bar path without time-stretch', () => {
    const bpm = 120;
    const bars = 4 as const;
    const sr = 48000;
    const window = planCaptureWindow(bpm, bars);
    expect(window.totalMs).toBe(8000 + FLIP_PRE_ROLL_MS + FLIP_POST_ROLL_MS);

    let m = initialFlipMachine();
    m = transition(m, { type: 'ARM' });
    m = armWaiting(m);
    m = transition(m, { type: 'BOUNDARY' });
    m = transition(m, { type: 'STOP_REC' });
    m = transition(m, { type: 'PROCESS_DONE' });
    expect(m.phase).toBe('ready');
    expect(m.lastQuantized).toBe(true);

    const content = expectedContentFrames(bpm, bars, sr);
    const pre = Math.round((FLIP_PRE_ROLL_MS / 1000) * sr);
    const post = Math.round((FLIP_POST_ROLL_MS / 1000) * sr);
    const raw = toneLoop(pre + content + post, sr);
    const trim = buildTrimFromCapture({
      frameCount: raw.left.length,
      sampleRate: sr,
      bpm,
      bars,
      captureOffsetMs: 0,
    });
    expect(trim.endFrame - trim.startFrame).toBe(content);

    const align = assessAlignment({
      quantized: true,
      clockSource: 'internal',
      captureOffsetMs: 0,
      calibrated: false,
      trimExact: true,
    });
    expect(align.alignment).toBe('aligned');

    const clip: FlipClipMeta = {
      schemaVersion: 1,
      id: 'flip-smoke',
      takeId: 'take-smoke',
      name: 'FLIP smoke',
      createdAt: Date.now(),
      bars,
      bpm,
      sampleRate: sr,
      frameCount: raw.left.length,
      inputDeviceId: null,
      inputDeviceLabel: 'sim',
      captureOffsetMs: 0,
      trim,
      alignment: align.alignment,
      confidence: align.confidence,
      confidenceNote: align.note,
      reverse: false,
      fadeInMs: 5,
      fadeOutMs: 5,
      gain: 1,
      chop: { slices: 8 },
      sliceSeq: null,
      clockSource: 'internal',
    };

    const preview = renderFlipAudio(raw, clip);
    expect(preview.left.length).toBe(content);

    const slices = chopEqual(preview, 8);
    expect(slices).toHaveLength(8);

    const wav = encodeWav(preview, 24, { title: clip.name, bpm: '120' });
    const header = parseWavHeader(wav);
    expect(header.sampleRate).toBe(sr);
    expect(header.bitsPerSample).toBe(24);
    expect(header.numChannels).toBe(2);
    expect(header.dataSize / (2 * 3)).toBe(content);

    const wav16 = encodeWav(preview, 16);
    expect(parseWavHeader(wav16).bitsPerSample).toBe(16);

    expect(defaultFlipFilename(clip, 24)).toMatch(/FLIP_smoke_4bar_24bit\.wav/);
  });
});
