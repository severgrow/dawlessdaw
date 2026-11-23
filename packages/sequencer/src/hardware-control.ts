/**
 * Circuit P2 — opt-in Hardware Control Mode.
 *
 * Listens to documented Circuit macros CC 21–28 (+ optional Mixer 29/30).
 * Drives generative settings / generate / mutate / reset / lock / undo.
 * Never invents button MIDI. Never SysEx. Never a second clock master.
 *
 * When mode is **off**, this engine ignores all CCs — Ploe Live / Controller
 * routes stay unchanged.
 *
 * Honesty: experimental / untested until Bench (macro TX + control mode).
 */

import { SCALES, type ScaleId } from './scale';

export const HW_CONTROL_HONESTY = 'experimental' as const;

export const HW_CONTROL_DISCLAIMER =
  'Opt-in Hardware Control Mode uses Circuit macros CC 21–28 (+ optional Mixer 29/30). Buttons (mute/scene/pattern/track/record) have no MIDI — Guide only. Not Guided Record. Needs Bench.';

/** Documented Circuit macro / mixer CCs used by control mode. */
export const HW_MACRO_CCS = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const HW_MIXER_LEVEL_CC = 29;
export const HW_MIXER_PAN_CC = 30;

export type HwControlAction =
  | 'set-root'
  | 'set-scale'
  | 'set-density'
  | 'set-mutation'
  | 'set-seed'
  | 'generate'
  | 'mutate'
  | 'reset'
  | 'toggle-lock'
  | 'undo';

export type HwControlParamKind = 'continuous' | 'trigger';

export interface HwControlBinding {
  cc: number;
  /** Circuit panel label (PRG macro / mixer) */
  label: string;
  action: HwControlAction;
  kind: HwControlParamKind;
  /** When true, only active if mixerEnabled */
  mixerOptional?: boolean;
}

/** Default map — macros drive generative; triggers use hysteresis. */
export const DEFAULT_HW_BINDINGS: readonly HwControlBinding[] = [
  { cc: 21, label: 'Macro 1 · Tune', action: 'set-root', kind: 'continuous' },
  { cc: 22, label: 'Macro 2 · Start', action: 'set-scale', kind: 'continuous' },
  { cc: 23, label: 'Macro 3 · Length', action: 'set-density', kind: 'continuous' },
  { cc: 24, label: 'Macro 4 · Slope', action: 'set-mutation', kind: 'continuous' },
  { cc: 25, label: 'Macro 5 · Distortion', action: 'set-seed', kind: 'continuous' },
  { cc: 26, label: 'Macro 6 · HPF', action: 'generate', kind: 'trigger' },
  { cc: 27, label: 'Macro 7 · LPF', action: 'mutate', kind: 'trigger' },
  { cc: 28, label: 'Macro 8 · Resonance', action: 'reset', kind: 'trigger' },
  {
    cc: 29,
    label: 'Mixer · Level',
    action: 'toggle-lock',
    kind: 'trigger',
    mixerOptional: true,
  },
  {
    cc: 30,
    label: 'Mixer · Pan',
    action: 'undo',
    kind: 'trigger',
    mixerOptional: true,
  },
] as const;

/**
 * Schmitt-trigger hysteresis for "trigger" knobs.
 * Fire once on rising edge across `high`; re-arm only after falling below `low`.
 * Prevents generate/mutate spam while twisting through the top of travel.
 */
export interface HysteresisState {
  armed: boolean;
}

export function emptyHysteresis(armed = true): HysteresisState {
  return { armed };
}

export interface HysteresisResult {
  fired: boolean;
  state: HysteresisState;
}

export function applyTriggerHysteresis(
  state: HysteresisState,
  value: number,
  opts?: { low?: number; high?: number },
): HysteresisResult {
  const low = opts?.low ?? 40;
  const high = opts?.high ?? 90;
  const v = Math.max(0, Math.min(127, Math.round(value)));
  const next: HysteresisState = { armed: state.armed };

  if (next.armed && v >= high) {
    next.armed = false;
    return { fired: true, state: next };
  }
  if (!next.armed && v <= low) {
    next.armed = true;
  }
  return { fired: false, state: next };
}

export interface HwControlSettingsPatch {
  root?: number;
  scaleId?: ScaleId;
  density?: number;
  mutation?: number;
  seed?: number;
}

export type HwControlCommand =
  | { type: 'settings'; patch: HwControlSettingsPatch }
  | { type: 'generate' }
  | { type: 'mutate' }
  | { type: 'reset' }
  | { type: 'toggle-lock' }
  | { type: 'undo' };

export interface HwControlPrefs {
  /** Master latch — off by default so Ploe Live routes are untouched. */
  enabled: boolean;
  /** Include Mixer Level/Pan CC 29/30 as lock/undo triggers. */
  mixerEnabled: boolean;
  hysteresisLow: number;
  hysteresisHigh: number;
}

export const DEFAULT_HW_CONTROL_PREFS: HwControlPrefs = {
  enabled: false,
  mixerEnabled: false,
  hysteresisLow: 40,
  hysteresisHigh: 90,
};

export interface HwControlSnapshot {
  honesty: typeof HW_CONTROL_HONESTY;
  disclaimer: string;
  prefs: HwControlPrefs;
  bindings: readonly HwControlBinding[];
  lastAction: { action: HwControlAction; track: number; cc: number; at: number } | null;
  /** Active track channel last heard while mode on (1–8) */
  lastTrack: number | null;
}

export type HwControlListener = () => void;

function mapRoot(value: number): number {
  return Math.min(11, Math.floor((Math.max(0, Math.min(127, value)) / 128) * 12));
}

function mapScaleId(value: number): ScaleId {
  const idx = Math.min(
    SCALES.length - 1,
    Math.floor((Math.max(0, Math.min(127, value)) / 128) * SCALES.length),
  );
  return SCALES[idx]!.id;
}

function map01(value: number): number {
  return Math.max(0, Math.min(1, Math.max(0, Math.min(127, value)) / 127));
}

function mapSeed(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value))) >>> 0;
}

/**
 * Pure mapping: CC + value → command (or null).
 * Trigger hysteresis is applied by the engine, not here.
 */
export function mapContinuousCc(
  action: HwControlAction,
  value: number,
): HwControlCommand | null {
  switch (action) {
    case 'set-root':
      return { type: 'settings', patch: { root: mapRoot(value) } };
    case 'set-scale':
      return { type: 'settings', patch: { scaleId: mapScaleId(value) } };
    case 'set-density':
      return { type: 'settings', patch: { density: map01(value) } };
    case 'set-mutation':
      return { type: 'settings', patch: { mutation: map01(value) } };
    case 'set-seed':
      return { type: 'settings', patch: { seed: mapSeed(value) } };
    default:
      return null;
  }
}

export function triggerCommand(action: HwControlAction): HwControlCommand | null {
  switch (action) {
    case 'generate':
      return { type: 'generate' };
    case 'mutate':
      return { type: 'mutate' };
    case 'reset':
      return { type: 'reset' };
    case 'toggle-lock':
      return { type: 'toggle-lock' };
    case 'undo':
      return { type: 'undo' };
    default:
      return null;
  }
}

/** Buttons with no MIDI — Guide text only. Never claim remote control. */
export const HW_GUIDE_BUTTONS: readonly {
  id: string;
  title: string;
  onDevice: string;
}[] = [
  {
    id: 'mute',
    title: 'Mute',
    onDevice: 'Press Mixer mute on the Circuit track — no MIDI; Splot cannot remote this.',
  },
  {
    id: 'scene',
    title: 'Scene',
    onDevice: 'Press Scenes on Circuit — no dedicated MIDI. Guide only.',
  },
  {
    id: 'pattern',
    title: 'Pattern',
    onDevice: 'Select Patterns on Circuit — no dedicated MIDI. Guide only.',
  },
  {
    id: 'track',
    title: 'Track select',
    onDevice: 'Press a track pad on Circuit — no MIDI. Focus updates when that track emits notes/CCs.',
  },
  {
    id: 'record',
    title: 'Record arm',
    onDevice: 'Press Record on Circuit — no MIDI arm message. Guided Record is P3 (not this mode).',
  },
] as const;

export interface HwGuideStep {
  id: string;
  title: string;
  body: string;
  kind: 'setup' | 'macro' | 'button' | 'safety';
  active: boolean;
}

export interface HwGuideContext {
  circuitInAssigned: boolean;
  modeEnabled: boolean;
  mixerEnabled: boolean;
  hasSource: boolean;
  ccTxHint: boolean;
}

/** Adaptive Hardware Guide — next actions based on state. Buttons stay Guide-only. */
export function buildHardwareGuide(ctx: HwGuideContext): HwGuideStep[] {
  const steps: HwGuideStep[] = [];

  steps.push({
    id: 'ports',
    title: 'Circuit MIDI in',
    body: ctx.circuitInAssigned
      ? 'Circuit in assigned.'
      : 'Setup → Ports: assign Circuit USB in. CC Tx ON (Setup pad 28).',
    kind: 'setup',
    active: !ctx.circuitInAssigned,
  });

  steps.push({
    id: 'mode',
    title: 'Hardware Control Mode',
    body: ctx.modeEnabled
      ? 'Mode ON — twist macros on the active Circuit track to drive Generate / scale.'
      : 'Enable Hardware Control Mode (opt-in). Off = Ploe Live routes unchanged.',
    kind: 'setup',
    active: ctx.circuitInAssigned && !ctx.modeEnabled,
  });

  if (ctx.modeEnabled) {
    steps.push({
      id: 'source',
      title: 'Capture a source',
      body: ctx.hasSource
        ? 'Source ready — Generate / Mutate unlocked steps.'
        : 'Pattern → Source, or Live → Use as source, before Generate.',
      kind: 'macro',
      active: !ctx.hasSource,
    });
    steps.push({
      id: 'macros',
      title: 'Macros CC 21–28',
      body: 'Tune→root · Start→scale · Length→density · Slope→mutate amt · Dist→seed · HPF→Generate · LPF→Mutate · Res→Reset.',
      kind: 'macro',
      active: ctx.hasSource,
    });
    if (ctx.mixerEnabled) {
      steps.push({
        id: 'mixer',
        title: 'Mixer 29/30',
        body: 'Level→lock step · Pan→undo (Mixer view ▼/▲). Still experimental.',
        kind: 'macro',
        active: true,
      });
    }
  }

  for (const b of HW_GUIDE_BUTTONS) {
    steps.push({
      id: `btn-${b.id}`,
      title: b.title,
      body: b.onDevice,
      kind: 'button',
      active: false,
    });
  }

  steps.push({
    id: 'safety',
    title: 'Safety',
    body: 'No SysEx. No invented button MIDI. Circuit stays clock master. Mode off never touches routes.',
    kind: 'safety',
    active: false,
  });

  return steps;
}

/**
 * Hardware Control Mode engine — call only with Circuit **input** CCs when armed.
 */
export class HardwareControlEngine {
  private prefs: HwControlPrefs = { ...DEFAULT_HW_CONTROL_PREFS };
  private hyst = new Map<number, HysteresisState>();
  private lastAction: HwControlSnapshot['lastAction'] = null;
  private lastTrack: number | null = null;
  private listeners = new Set<HwControlListener>();
  private cached: HwControlSnapshot | null = null;
  private readonly now: () => number;

  constructor(opts?: { now?: () => number; prefs?: Partial<HwControlPrefs> }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    if (opts?.prefs) this.prefs = { ...this.prefs, ...opts.prefs };
  }

  subscribe(fn: HwControlListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): HwControlSnapshot {
    if (!this.cached) {
      this.cached = {
        honesty: HW_CONTROL_HONESTY,
        disclaimer: HW_CONTROL_DISCLAIMER,
        prefs: { ...this.prefs },
        bindings: DEFAULT_HW_BINDINGS,
        lastAction: this.lastAction ? { ...this.lastAction } : null,
        lastTrack: this.lastTrack,
      };
    }
    return this.cached;
  }

  setEnabled(on: boolean): void {
    this.prefs = { ...this.prefs, enabled: on };
    if (!on) {
      this.hyst.clear();
      this.lastAction = null;
    }
    this.emit();
  }

  setMixerEnabled(on: boolean): void {
    this.prefs = { ...this.prefs, mixerEnabled: on };
    this.emit();
  }

  setHysteresis(low: number, high: number): void {
    const lo = Math.max(0, Math.min(126, Math.round(low)));
    const hi = Math.max(lo + 1, Math.min(127, Math.round(high)));
    this.prefs = { ...this.prefs, hysteresisLow: lo, hysteresisHigh: hi };
    this.emit();
  }

  isEnabled(): boolean {
    return this.prefs.enabled;
  }

  /**
   * Process a Circuit-in CC. Returns a command when mode is on and the CC maps.
   * Returns null when mode off, unknown CC, or trigger not yet crossed.
   */
  onCc(track: number, cc: number, value: number): HwControlCommand | null {
    if (!this.prefs.enabled) return null;
    if (track < 1 || track > 8) return null;

    const binding = DEFAULT_HW_BINDINGS.find((b) => b.cc === cc);
    if (!binding) return null;
    if (binding.mixerOptional && !this.prefs.mixerEnabled) return null;

    this.lastTrack = track;

    if (binding.kind === 'continuous') {
      const cmd = mapContinuousCc(binding.action, value);
      if (cmd) {
        this.lastAction = {
          action: binding.action,
          track,
          cc,
          at: this.now(),
        };
        this.emit();
      }
      return cmd;
    }

    // Trigger with hysteresis
    const prev = this.hyst.get(cc) ?? emptyHysteresis(true);
    const { fired, state } = applyTriggerHysteresis(prev, value, {
      low: this.prefs.hysteresisLow,
      high: this.prefs.hysteresisHigh,
    });
    this.hyst.set(cc, state);
    if (!fired) {
      this.emit();
      return null;
    }
    const cmd = triggerCommand(binding.action);
    if (cmd) {
      this.lastAction = {
        action: binding.action,
        track,
        cc,
        at: this.now(),
      };
      this.emit();
    }
    return cmd;
  }

  /** For tests: peek hysteresis armed state. */
  isTriggerArmed(cc: number): boolean {
    return (this.hyst.get(cc) ?? emptyHysteresis(true)).armed;
  }
}

/** Product constraints for P2. */
export const HW_CONTROL_FORBIDDEN = {
  sysex: true,
  inventedButtonMidi: true,
  secondClockMaster: true,
  guidedRecordClaim: true,
  ncsWriter: true,
  breakRoutesWhenOff: true,
} as const;
