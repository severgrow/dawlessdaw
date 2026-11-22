import {
  SEQ_PATTERN_SLOTS,
  SEQ_SCHEMA_VERSION,
  SEQ_STEP_COUNT,
  SEQ_TRACK_COUNT,
  type SeqBank,
  type SeqPattern,
  type SeqStep,
  type SeqTrack,
} from './types';

const DEFAULT_PITCHES = [36, 38, 42, 46, 48, 50, 52, 55];

export function emptyStep(pitch = 60, velocity = 100, gate = 0.85): SeqStep {
  return { on: false, pitch, velocity, gate };
}

export function emptyTrack(index: number): SeqTrack {
  const pitch = DEFAULT_PITCHES[index] ?? 60;
  return {
    muted: false,
    solo: false,
    defaultPitch: pitch,
    defaultVelocity: 100,
    defaultGate: 0.85,
    steps: Array.from({ length: SEQ_STEP_COUNT }, () => emptyStep(pitch)),
  };
}

export function createPattern(slot: number, bpm = 120): SeqPattern {
  const n = Math.max(1, Math.min(SEQ_PATTERN_SLOTS, slot));
  return {
    schemaVersion: SEQ_SCHEMA_VERSION,
    id: `dawlessdaw-pattern-${n}`,
    name: `Dawlessdaw Pattern ${n}`,
    length: SEQ_STEP_COUNT,
    bpm,
    tracks: Array.from({ length: SEQ_TRACK_COUNT }, (_, i) => emptyTrack(i)),
  };
}

export function createBank(bpm = 120): SeqBank {
  return {
    schemaVersion: SEQ_SCHEMA_VERSION,
    patterns: Array.from({ length: SEQ_PATTERN_SLOTS }, (_, i) => createPattern(i + 1, bpm)),
    activePatternIndex: 0,
    clockSource: 'circuit',
  };
}

export function clonePattern(p: SeqPattern): SeqPattern {
  return {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      steps: t.steps.map((s) => ({ ...s })),
    })),
  };
}

export function cloneBank(b: SeqBank): SeqBank {
  return {
    ...b,
    patterns: b.patterns.map(clonePattern),
  };
}

export function activePattern(bank: SeqBank): SeqPattern {
  return bank.patterns[bank.activePatternIndex] ?? bank.patterns[0]!;
}

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function clampFloat(n: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeStep(raw: unknown, fallbackPitch: number): SeqStep {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    on: Boolean(s.on),
    pitch: clampInt(s.pitch, 0, 127, fallbackPitch),
    velocity: clampInt(s.velocity, 1, 127, 100),
    gate: clampFloat(s.gate, 0.05, 1, 0.85),
  };
}

function sanitizeTrack(raw: unknown, index: number): SeqTrack {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaultPitch = clampInt(t.defaultPitch, 0, 127, DEFAULT_PITCHES[index] ?? 60);
  const stepsRaw = Array.isArray(t.steps) ? t.steps : [];
  const steps = Array.from({ length: SEQ_STEP_COUNT }, (_, i) =>
    sanitizeStep(stepsRaw[i], defaultPitch),
  );
  return {
    muted: Boolean(t.muted),
    solo: Boolean(t.solo),
    defaultPitch,
    defaultVelocity: clampInt(t.defaultVelocity, 1, 127, 100),
    defaultGate: clampFloat(t.defaultGate, 0.05, 1, 0.85),
    steps,
  };
}

export function sanitizePattern(raw: unknown, slot = 1): SeqPattern | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SEQ_SCHEMA_VERSION) return null;
  const base = createPattern(slot);
  const tracksRaw = Array.isArray(o.tracks) ? o.tracks : [];
  return {
    schemaVersion: SEQ_SCHEMA_VERSION,
    id: typeof o.id === 'string' && o.id ? o.id : base.id,
    name: typeof o.name === 'string' && o.name ? o.name.slice(0, 48) : base.name,
    length: clampInt(o.length, 1, SEQ_STEP_COUNT, SEQ_STEP_COUNT),
    bpm: clampInt(o.bpm, 40, 300, 120),
    tracks: Array.from({ length: SEQ_TRACK_COUNT }, (_, i) => sanitizeTrack(tracksRaw[i], i)),
  };
}

export function sanitizeBank(raw: unknown): SeqBank | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SEQ_SCHEMA_VERSION) return null;
  const patternsRaw = Array.isArray(o.patterns) ? o.patterns : [];
  const patterns = Array.from({ length: SEQ_PATTERN_SLOTS }, (_, i) => {
    const p = sanitizePattern(patternsRaw[i], i + 1);
    return p ?? createPattern(i + 1);
  });
  return {
    schemaVersion: SEQ_SCHEMA_VERSION,
    patterns,
    activePatternIndex: clampInt(o.activePatternIndex, 0, SEQ_PATTERN_SLOTS - 1, 0),
    clockSource: o.clockSource === 'internal' ? 'internal' : 'circuit',
  };
}

export function exportBankJson(bank: SeqBank): string {
  return JSON.stringify(cloneBank(bank), null, 2);
}

export function importBankJson(raw: string): { ok: boolean; bank?: SeqBank; errors: string[] } {
  try {
    const data = JSON.parse(raw);
    const bank = sanitizeBank(data);
    if (!bank) return { ok: false, errors: ['Unsupported or invalid sequencer bank'] };
    return { ok: true, bank, errors: [] };
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
}

/** Tracks that should fire given mute/solo state. */
export function audibleTracks(pattern: SeqPattern): boolean[] {
  const anySolo = pattern.tracks.some((t) => t.solo);
  return pattern.tracks.map((t) => {
    if (anySolo) return t.solo && !t.muted;
    return !t.muted;
  });
}

export function toggleStep(pattern: SeqPattern, track: number, step: number): SeqPattern {
  const next = clonePattern(pattern);
  const tr = next.tracks[track - 1];
  if (!tr) return pattern;
  const st = tr.steps[step];
  if (!st) return pattern;
  if (st.on) {
    st.on = false;
  } else {
    st.on = true;
    st.pitch = tr.defaultPitch;
    st.velocity = tr.defaultVelocity;
    st.gate = tr.defaultGate;
  }
  return next;
}

export function setStepParams(
  pattern: SeqPattern,
  track: number,
  step: number,
  patch: Partial<Pick<SeqStep, 'pitch' | 'velocity' | 'gate' | 'on'>>,
): SeqPattern {
  const next = clonePattern(pattern);
  const st = next.tracks[track - 1]?.steps[step];
  if (!st) return pattern;
  if (patch.on !== undefined) st.on = patch.on;
  if (patch.pitch !== undefined) st.pitch = clampInt(patch.pitch, 0, 127, st.pitch);
  if (patch.velocity !== undefined) st.velocity = clampInt(patch.velocity, 1, 127, st.velocity);
  if (patch.gate !== undefined) st.gate = clampFloat(patch.gate, 0.05, 1, st.gate);
  return next;
}
