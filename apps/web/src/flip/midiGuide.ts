/**
 * MIDI-guided FLIP (Milestone 5) — capture MIDI note-ons alongside audio,
 * suggest slice points (grid / midi / manual), refine with nearby onsets.
 *
 * Analysis only for slicing: never plays MIDI back, never writes SP serial.
 * Original take PCM stays untouched; slices are non-destructive windows.
 */

import type { StereoAudio } from '../recorder/types';
import { loadCalibrations } from '../timing/onset';
import type { FlipBarCount, FlipChop } from './types';

export type FlipSliceMode = 'grid' | 'midi' | 'manual';

export type FlipLatencySource = 'timing-lab' | 'flip-offset' | 'estimate';

export interface FlipMidiEvent {
  id: string;
  /** ms from capture start (wall / performance) */
  atMs: number;
  /** Estimated sample in take before latency compensation */
  sample: number;
  channel: number;
  note: number;
  velocity: number;
  /** Hardware-aware label from Controller routing (context only — not a stem claim) */
  label: string;
  honesty: 'experimental';
}

export interface FlipGuidedSlice {
  id: string;
  startFrame: number;
  endFrame: number;
  source: 'grid' | 'midi' | 'manual' | 'refined';
  label: string;
  midiEventId: string | null;
}

export interface FlipMidiGuideState {
  mode: FlipSliceMode;
  events: FlipMidiEvent[];
  slices: FlipGuidedSlice[];
  latencyMs: number;
  latencySource: FlipLatencySource;
  latencyCalibrated: boolean;
  latencyNote: string;
}

export interface LatencyResolveOpts {
  audioInputId: string | null;
  flipOffsetMs: number;
  flipCalibrated: boolean;
}

export function resolveFlipLatency(opts: LatencyResolveOpts): {
  ms: number;
  source: FlipLatencySource;
  calibrated: boolean;
  note: string;
} {
  const cals = loadCalibrations();
  const match = opts.audioInputId
    ? cals.find((c) => c.audioInputId === opts.audioInputId)
    : cals[0];
  if (match && Number.isFinite(match.medianMs)) {
    return {
      ms: match.medianMs,
      source: 'timing-lab',
      calibrated: true,
      note: `Timing Lab median ${match.medianMs} ms (${match.destination} → ${match.audioInputLabel}) — experimental`,
    };
  }
  if (opts.flipCalibrated && Number.isFinite(opts.flipOffsetMs)) {
    return {
      ms: opts.flipOffsetMs,
      source: 'flip-offset',
      calibrated: true,
      note: `FLIP Capture Offset ${opts.flipOffsetMs} ms (user-confirmed)`,
    };
  }
  const ms = Number.isFinite(opts.flipOffsetMs) ? opts.flipOffsetMs : 0;
  return {
    ms,
    source: 'estimate',
    calibrated: false,
    note:
      ms === 0
        ? 'Estimate 0 ms — run Timing Lab or set Offset ms (labelled estimate)'
        : `Estimate ${ms} ms from Offset — not Timing Lab calibrated`,
  };
}

export function emptyMidiGuide(
  latency: ReturnType<typeof resolveFlipLatency>,
): FlipMidiGuideState {
  return {
    mode: 'grid',
    events: [],
    slices: [],
    latencyMs: latency.ms,
    latencySource: latency.source,
    latencyCalibrated: latency.calibrated,
    latencyNote: latency.note,
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Map Circuit track channel → Controller destination label (context only). */
export function hardwareLabelForChannel(
  channel: number,
  tracks: Array<{ dest: { device: string; slot: number } | null } | null | undefined>,
  deviceNames: Record<string, string>,
): string {
  if (channel < 1 || channel > 8) return `ch ${channel}`;
  const tr = tracks[channel - 1];
  const dest = tr?.dest;
  if (!dest) return `T${channel} · unassigned`;
  const name = (deviceNames[dest.device] ?? dest.device).replace(' (Skiff)', '');
  const slot =
    dest.device === 'sp'
      ? ` bank ${'ABCDEFGHIJ'[dest.slot - 1] ?? '?'}`
      : ` track ${dest.slot}`;
  return `T${channel} → ${name}${slot}`;
}

export interface MidiCaptureSession {
  startedAtMs: number;
  sampleRate: number;
  events: FlipMidiEvent[];
}

export function beginMidiCapture(opts: {
  startedAtMs: number;
  sampleRate: number;
}): MidiCaptureSession {
  return {
    startedAtMs: opts.startedAtMs,
    sampleRate: opts.sampleRate > 0 ? opts.sampleRate : 48000,
    events: [],
  };
}

export function pushMidiNoteOn(
  session: MidiCaptureSession,
  opts: {
    atMs: number;
    channel: number;
    note: number;
    velocity: number;
    label: string;
  },
): FlipMidiEvent | null {
  if (opts.velocity <= 0) return null;
  if (opts.channel < 1 || opts.channel > 16) return null;
  const relativeMs = Math.max(0, opts.atMs - session.startedAtMs);
  const sample = Math.max(0, Math.round((relativeMs / 1000) * session.sampleRate));
  const ev: FlipMidiEvent = {
    id: makeId('fme'),
    atMs: relativeMs,
    sample,
    channel: opts.channel,
    note: opts.note,
    velocity: opts.velocity,
    label: opts.label,
    honesty: 'experimental',
  };
  session.events.push(ev);
  return ev;
}

export function msToFrame(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms / 1000) * sampleRate));
}

export function applyLatencyToSample(
  sample: number,
  latencyMs: number,
  sampleRate: number,
  frameCount: number,
): number {
  const shifted = sample + msToFrame(latencyMs, sampleRate);
  return Math.max(0, Math.min(frameCount, shifted));
}

/** Equal grid slices across the trim window. */
export function suggestGridSlices(opts: {
  startFrame: number;
  endFrame: number;
  slices: FlipChop['slices'] | number;
}): FlipGuidedSlice[] {
  const start = Math.max(0, Math.floor(opts.startFrame));
  const end = Math.max(start + 1, Math.floor(opts.endFrame));
  const n = Math.max(1, Math.min(64, Math.floor(opts.slices)));
  const out: FlipGuidedSlice[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + Math.floor(((end - start) * i) / n);
    const b = start + Math.floor(((end - start) * (i + 1)) / n);
    out.push({
      id: makeId('fgs'),
      startFrame: a,
      endFrame: Math.max(a + 1, b),
      source: 'grid',
      label: `Grid ${i + 1}/${n}`,
      midiEventId: null,
    });
  }
  return out;
}

/** One slice per MIDI note-on until next note or trim end. */
export function suggestMidiSlices(opts: {
  events: readonly FlipMidiEvent[];
  startFrame: number;
  endFrame: number;
  sampleRate: number;
  latencyMs: number;
  frameCount: number;
}): FlipGuidedSlice[] {
  const start = Math.max(0, Math.floor(opts.startFrame));
  const end = Math.max(start + 1, Math.floor(opts.endFrame));
  const points = opts.events
    .map((ev) => ({
      ev,
      frame: applyLatencyToSample(ev.sample, opts.latencyMs, opts.sampleRate, opts.frameCount),
    }))
    .filter((p) => p.frame >= start && p.frame < end)
    .sort((a, b) => a.frame - b.frame);

  if (points.length === 0) {
    return [
      {
        id: makeId('fgs'),
        startFrame: start,
        endFrame: end,
        source: 'midi',
        label: 'No MIDI notes in window — full trim',
        midiEventId: null,
      },
    ];
  }

  const out: FlipGuidedSlice[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = Math.max(start, points[i]!.frame);
    const b = i + 1 < points.length ? points[i + 1]!.frame : end;
    out.push({
      id: makeId('fgs'),
      startFrame: a,
      endFrame: Math.max(a + 1, Math.min(end, b)),
      source: 'midi',
      label: points[i]!.ev.label || `Note ${points[i]!.ev.note}`,
      midiEventId: points[i]!.ev.id,
    });
  }
  return out;
}

/**
 * Search nearby for a rising-energy onset; apply pre-margin; never zero-length.
 */
export function refineSliceStart(opts: {
  audio: StereoAudio;
  frame: number;
  searchMs?: number;
  preMarginMs?: number;
  minFrames?: number;
  endLimit: number;
}): number {
  const sr = opts.audio.sampleRate;
  const search = Math.max(1, Math.floor(((opts.searchMs ?? 15) / 1000) * sr));
  const pre = Math.max(0, Math.floor(((opts.preMarginMs ?? 5) / 1000) * sr));
  const minFrames = Math.max(1, opts.minFrames ?? Math.floor(0.01 * sr));
  const n = Math.min(opts.audio.left.length, opts.audio.right.length);
  const center = Math.max(0, Math.min(n - 1, Math.floor(opts.frame)));
  const lo = Math.max(0, center - search);
  const hi = Math.min(n - 1, center + search);

  let best = center;
  let bestScore = -1;
  for (let i = lo + 1; i <= hi; i++) {
    const prev =
      (Math.abs(opts.audio.left[i - 1]!) + Math.abs(opts.audio.right[i - 1]!)) / 2;
    const cur = (Math.abs(opts.audio.left[i]!) + Math.abs(opts.audio.right[i]!)) / 2;
    const rise = cur - prev;
    if (rise > bestScore) {
      bestScore = rise;
      best = i;
    }
  }
  let start = Math.max(0, best - pre);
  const endLimit = Math.max(start + minFrames, Math.floor(opts.endLimit));
  if (start + minFrames > endLimit) start = Math.max(0, endLimit - minFrames);
  return start;
}

export function refineGuidedSlices(
  slices: readonly FlipGuidedSlice[],
  audio: StereoAudio,
  opts?: { searchMs?: number; preMarginMs?: number; fadeHintMs?: number },
): FlipGuidedSlice[] {
  const n = Math.min(audio.left.length, audio.right.length);
  const minFrames = Math.max(1, Math.floor(((opts?.fadeHintMs ?? 8) / 1000) * audio.sampleRate));
  const out: FlipGuidedSlice[] = [];
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i]!;
    const nextStart = i + 1 < slices.length ? slices[i + 1]!.startFrame : s.endFrame;
    const endLimit = Math.min(n, Math.max(s.endFrame, nextStart));
    const start = refineSliceStart({
      audio,
      frame: s.startFrame,
      searchMs: opts?.searchMs,
      preMarginMs: opts?.preMarginMs,
      minFrames,
      endLimit,
    });
    const end = Math.max(start + minFrames, Math.min(n, s.endFrame));
    out.push({
      ...s,
      id: s.id,
      startFrame: start,
      endFrame: end,
      source: 'refined',
      label: s.label.startsWith('refined:') ? s.label : `refined: ${s.label}`,
    });
  }
  // Ensure non-overlapping monotonic ends
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i]!;
    const next = out[i + 1]!;
    if (cur.endFrame > next.startFrame) {
      out[i] = {
        ...cur,
        endFrame: Math.max(cur.startFrame + minFrames, next.startFrame),
      };
    }
  }
  return out;
}

export function suggestSlicesForMode(opts: {
  mode: FlipSliceMode;
  events: readonly FlipMidiEvent[];
  startFrame: number;
  endFrame: number;
  sampleRate: number;
  latencyMs: number;
  frameCount: number;
  gridSlices?: number;
  bars?: FlipBarCount;
}): FlipGuidedSlice[] {
  if (opts.mode === 'midi') {
    return suggestMidiSlices({
      events: opts.events,
      startFrame: opts.startFrame,
      endFrame: opts.endFrame,
      sampleRate: opts.sampleRate,
      latencyMs: opts.latencyMs,
      frameCount: opts.frameCount,
    });
  }
  if (opts.mode === 'manual') {
    return opts.events.length
      ? suggestMidiSlices({
          events: opts.events,
          startFrame: opts.startFrame,
          endFrame: opts.endFrame,
          sampleRate: opts.sampleRate,
          latencyMs: opts.latencyMs,
          frameCount: opts.frameCount,
        }).map((s) => ({ ...s, source: 'manual' as const, label: `manual: ${s.label}` }))
      : [
          {
            id: makeId('fgs'),
            startFrame: opts.startFrame,
            endFrame: Math.max(opts.startFrame + 1, opts.endFrame),
            source: 'manual',
            label: 'Manual — empty (add markers on waveform)',
            midiEventId: null,
          },
        ];
  }
  const slices =
    opts.gridSlices ??
    (opts.bars === 1 ? 4 : opts.bars === 2 ? 8 : opts.bars === 8 ? 16 : 8);
  return suggestGridSlices({
    startFrame: opts.startFrame,
    endFrame: opts.endFrame,
    slices,
  });
}

export function sanitizeMidiGuide(raw: unknown): FlipMidiGuideState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mode =
    o.mode === 'midi' || o.mode === 'manual' || o.mode === 'grid' ? o.mode : 'grid';
  const events = Array.isArray(o.events)
    ? (o.events as FlipMidiEvent[]).filter(
        (e) => e && typeof e.id === 'string' && typeof e.sample === 'number',
      )
    : [];
  const slices = Array.isArray(o.slices)
    ? (o.slices as FlipGuidedSlice[]).filter(
        (s) =>
          s &&
          typeof s.id === 'string' &&
          typeof s.startFrame === 'number' &&
          typeof s.endFrame === 'number',
      )
    : [];
  return {
    mode,
    events,
    slices,
    latencyMs: Number(o.latencyMs) || 0,
    latencySource:
      o.latencySource === 'timing-lab' || o.latencySource === 'flip-offset'
        ? o.latencySource
        : 'estimate',
    latencyCalibrated: o.latencyCalibrated === true,
    latencyNote: typeof o.latencyNote === 'string' ? o.latencyNote : '',
  };
}
