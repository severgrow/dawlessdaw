/**
 * Cross-device Super Macros (Milestone 3) — opt-in fan-out from Circuit macros.
 *
 * One Circuit macro (CC 21–28) → many destinations with curve / invert / soft takeover.
 * A/B Macro Scenes are Splot-owned value snapshots (not Circuit Scenes).
 * Rate-limit + coalesce protect gear. Only docs-backed / verified CC presets by default.
 *
 * Does not replace single-destination MIDI Learn on the Controller tab.
 */

import {
  CIRCUIT_MACRO_CCS,
  CTRL_DEVICES,
  DEVICE_NAME,
  KNOB_TARGETS,
  type CtrlDevice,
  type KnobTarget,
} from './controller';

export type MacroCurve = 'linear' | 'ease-in' | 'ease-out' | 's-curve';
export type TakeoverMode = 'direct' | 'pickup' | 'relative';
export type MacroHonesty = 'docs-backed' | 'verified' | 'experimental';

export type SuperMacroRoleId = 'mpc' | 'sp404' | 'fm1';

export interface SuperMacroDestPreset {
  id: string;
  device: CtrlDevice;
  roleId: SuperMacroRoleId;
  label: string;
  cc: number;
  /** Default channel hint (user can override). */
  defaultChannel: number;
  honesty: MacroHonesty;
  hint?: string;
}

/** Docs-backed CC catalog for Super Macros (Roland / Skiff README / MPC Learn CCs). */
export function buildSuperMacroPresets(): SuperMacroDestPreset[] {
  const out: SuperMacroDestPreset[] = [];
  for (const t of KNOB_TARGETS) {
    if (t.kind !== 'cc' || t.cc == null) continue;
    const roleId: SuperMacroRoleId = t.device === 'sp' ? 'sp404' : t.device === 'mpc' ? 'mpc' : 'fm1';
    out.push({
      id: t.id,
      device: t.device,
      roleId,
      label: `${DEVICE_NAME[t.device].replace(' (Skiff)', '')} · ${t.label}`,
      cc: t.cc,
      defaultChannel: t.device === 'sp' ? 1 : t.device === 'mpc' ? 9 : 1,
      honesty: t.verified ? 'verified' : 'docs-backed',
      hint: t.hint,
    });
  }
  return out;
}

export const SUPER_MACRO_PRESETS = buildSuperMacroPresets();

export function superMacroPreset(id: string): SuperMacroDestPreset | undefined {
  return SUPER_MACRO_PRESETS.find((p) => p.id === id);
}

export interface SuperMacroDestination {
  id: string;
  /** Catalog preset id, or null for advanced custom (discouraged). */
  presetId: string | null;
  device: CtrlDevice;
  roleId: SuperMacroRoleId;
  label: string;
  channel: number;
  cc: number;
  min: number;
  max: number;
  curve: MacroCurve;
  invert: boolean;
  enabled: boolean;
  takeover: TakeoverMode;
  honesty: MacroHonesty;
}

export interface SuperMacro {
  id: string;
  name: string;
  /** Master enable — macros are opt-in. */
  enabled: boolean;
  /** Circuit track 1–8, or 0 = any track (whichever macro channel arrives). */
  sourceTrack: number;
  /** Macro knob index 0–7 (CC 21–28). */
  sourceKnob: number;
  destinations: SuperMacroDestination[];
}

export interface MacroSceneValues {
  /** destinationId → last value 0–127 Splot would send */
  values: Record<string, number>;
}

export interface MacroSceneBank {
  nameA: string;
  nameB: string;
  a: MacroSceneValues;
  b: MacroSceneValues;
  morphMs: number;
  curve: MacroCurve;
  /** Start morph on next bar boundary when position available. */
  barQuantize: boolean;
}

export interface SuperMacroTrafficConfig {
  /** Max CC messages per destination per second (coalesce within window). */
  maxHz: number;
  /** Master kill — no Super Macro output. */
  disabled: boolean;
}

export interface CcOutIntent {
  destId: string;
  roleId: SuperMacroRoleId;
  channel: number;
  cc: number;
  value: number;
  macroId: string;
  label: string;
}

export interface TrafficMonitorLine {
  at: number;
  text: string;
  roleId: SuperMacroRoleId;
  channel: number;
  cc: number;
  value: number;
}

export interface DestRuntimeState {
  /** Last value Splot sent (0–127). */
  lastSent: number | null;
  /** Pickup: waiting to cross before sending. */
  pickupLatched: boolean;
  /** Last mapped value (for pickup cross detection). */
  prevMapped: number | null;
  /** Last source value seen (for relative). */
  lastSource: number | null;
  /** Rate-limit: last emit performance time. */
  lastEmitAt: number;
  /** Pending coalesced value. */
  pending: number | null;
}

export interface MorphState {
  active: boolean;
  from: Record<string, number>;
  to: Record<string, number>;
  startedAt: number;
  durationMs: number;
  curve: MacroCurve;
  /** If set, wait until musical bar advances to this value. */
  waitBar: number | null;
  cancelled: boolean;
}

export interface SuperMacroSnapshot {
  honesty: 'experimental';
  enabledGlobal: boolean;
  macros: SuperMacro[];
  scenes: MacroSceneBank;
  traffic: SuperMacroTrafficConfig;
  monitor: TrafficMonitorLine[];
  /** destId → runtime */
  destState: Record<string, { lastSent: number | null; pickupLatched: boolean; mode: TakeoverMode }>;
  morph: {
    active: boolean;
    progress: number;
    waitBar: number | null;
    cancelled: boolean;
  };
  lastSource: { track: number; knob: number; value: number; at: number } | null;
}

export type SuperMacroListener = () => void;

export function applyCurve(t: number, curve: MacroCurve): number {
  const x = Math.min(1, Math.max(0, t));
  switch (curve) {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 's-curve':
      return x * x * (3 - 2 * x);
    default:
      return x;
  }
}

/** Map source 0–127 through invert + curve + min/max. */
export function mapMacroValue(source: number, dest: Pick<SuperMacroDestination, 'min' | 'max' | 'curve' | 'invert'>): number {
  let t = Math.min(127, Math.max(0, source)) / 127;
  if (dest.invert) t = 1 - t;
  t = applyCurve(t, dest.curve);
  const v = dest.min + t * (dest.max - dest.min);
  return Math.round(Math.min(127, Math.max(0, v)));
}

export function emptySceneBank(): MacroSceneBank {
  return {
    nameA: 'Scene A',
    nameB: 'Scene B',
    a: { values: {} },
    b: { values: {} },
    morphMs: 2000,
    curve: 's-curve',
    barQuantize: false,
  };
}

export function defaultTraffic(): SuperMacroTrafficConfig {
  return { maxHz: 30, disabled: false };
}

export function createDestinationFromPreset(presetId: string, overrides?: Partial<SuperMacroDestination>): SuperMacroDestination | null {
  const p = superMacroPreset(presetId);
  if (!p) return null;
  return {
    id: `dest-${presetId}-${Math.random().toString(36).slice(2, 8)}`,
    presetId: p.id,
    device: p.device,
    roleId: p.roleId,
    label: p.label,
    channel: p.defaultChannel,
    cc: p.cc,
    min: 0,
    max: 127,
    curve: 'linear',
    invert: false,
    enabled: true,
    takeover: 'direct',
    honesty: p.honesty,
    ...overrides,
  };
}

export function createEmptySuperMacro(partial?: Partial<SuperMacro>): SuperMacro {
  return {
    id: `sm-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Super Macro',
    enabled: false,
    sourceTrack: 0,
    sourceKnob: 0,
    destinations: [],
    ...partial,
  };
}

/**
 * Pure Super Macro engine — analysis + CC intents.
 * Host sends MIDI; engine never touches Web MIDI itself.
 */
export class SuperMacroEngine {
  private macros: SuperMacro[] = [];
  private scenes: MacroSceneBank = emptySceneBank();
  private traffic: SuperMacroTrafficConfig = defaultTraffic();
  private destRuntime = new Map<string, DestRuntimeState>();
  private monitor: TrafficMonitorLine[] = [];
  private morph: MorphState = {
    active: false,
    from: {},
    to: {},
    startedAt: 0,
    durationMs: 0,
    curve: 's-curve',
    waitBar: null,
    cancelled: false,
  };
  private lastSource: SuperMacroSnapshot['lastSource'] = null;
  private activeTrack: number | null = null;
  private currentBar = 0;
  private cached: SuperMacroSnapshot | null = null;
  private listeners = new Set<SuperMacroListener>();
  private readonly now: () => number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { now?: () => number }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  subscribe(fn: SuperMacroListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cached = null;
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): SuperMacroSnapshot {
    if (!this.cached) this.cached = this.build();
    return this.cached;
  }

  private build(): SuperMacroSnapshot {
    const destState: SuperMacroSnapshot['destState'] = {};
    for (const m of this.macros) {
      for (const d of m.destinations) {
        const st = this.ensureDest(d.id, d.takeover);
        destState[d.id] = {
          lastSent: st.lastSent,
          pickupLatched: st.pickupLatched,
          mode: d.takeover,
        };
      }
    }
    let progress = 0;
    if (this.morph.active && this.morph.durationMs > 0 && this.morph.waitBar == null) {
      progress = Math.min(1, (this.now() - this.morph.startedAt) / this.morph.durationMs);
    }
    return {
      honesty: 'experimental',
      enabledGlobal: !this.traffic.disabled && this.macros.some((m) => m.enabled),
      macros: this.macros.map((m) => ({
        ...m,
        destinations: m.destinations.map((d) => ({ ...d })),
      })),
      scenes: {
        ...this.scenes,
        a: { values: { ...this.scenes.a.values } },
        b: { values: { ...this.scenes.b.values } },
      },
      traffic: { ...this.traffic },
      monitor: this.monitor.slice(0, 40),
      destState,
      morph: {
        active: this.morph.active,
        progress,
        waitBar: this.morph.waitBar,
        cancelled: this.morph.cancelled,
      },
      lastSource: this.lastSource ? { ...this.lastSource } : null,
    };
  }

  setMacros(macros: SuperMacro[]): void {
    this.macros = macros.map((m) => ({
      ...m,
      destinations: m.destinations.map((d) => ({ ...d })),
    }));
    this.emit();
  }

  getMacros(): SuperMacro[] {
    return this.macros;
  }

  setScenes(scenes: MacroSceneBank): void {
    this.scenes = {
      ...scenes,
      a: { values: { ...scenes.a.values } },
      b: { values: { ...scenes.b.values } },
    };
    this.emit();
  }

  setTraffic(cfg: Partial<SuperMacroTrafficConfig>): void {
    this.traffic = { ...this.traffic, ...cfg };
    this.emit();
  }

  setActiveTrack(track: number | null): void {
    this.activeTrack = track;
  }

  /** Musical bar from M1/M2 — for bar-quantised morph start. */
  setMusicalBar(bar: number): void {
    this.currentBar = bar;
    if (this.morph.active && this.morph.waitBar != null && bar >= this.morph.waitBar) {
      this.morph.waitBar = null;
      this.morph.startedAt = this.now();
      this.emit();
    }
  }

  panic(): void {
    this.traffic = { ...this.traffic, disabled: true };
    this.cancelMorph();
    for (const st of this.destRuntime.values()) {
      st.pending = null;
      st.pickupLatched = true;
    }
    const panicLine: TrafficMonitorLine = {
      at: this.now(),
      text: 'Super Macros panic — output disabled',
      roleId: 'mpc',
      channel: 0,
      cc: 0,
      value: 0,
    };
    this.monitor = [panicLine, ...this.monitor].slice(0, 40);
    this.emit();
  }

  enableAfterPanic(): void {
    this.traffic = { ...this.traffic, disabled: false };
    this.emit();
  }

  private ensureDest(id: string, takeover: TakeoverMode): DestRuntimeState {
    let st = this.destRuntime.get(id);
    if (!st) {
      st = {
        lastSent: null,
        pickupLatched: takeover === 'pickup',
        prevMapped: null,
        lastSource: null,
        lastEmitAt: Number.NEGATIVE_INFINITY,
        pending: null,
      };
      this.destRuntime.set(id, st);
    }
    return st;
  }

  /**
   * Handle Circuit macro CC. Returns CC intents the host should send (already rate-limited).
   */
  onMacroCc(track: number, knob: number, value: number): CcOutIntent[] {
    const at = this.now();
    this.lastSource = { track, knob, value, at };
    if (this.traffic.disabled) {
      this.emit();
      return [];
    }
    const intents: CcOutIntent[] = [];
    for (const macro of this.macros) {
      if (!macro.enabled) continue;
      // sourceTrack 0 = any Circuit track channel
      const okTrack = macro.sourceTrack === 0 || macro.sourceTrack === track;
      if (!okTrack) continue;
      if (macro.sourceKnob !== knob) continue;

      for (const dest of macro.destinations) {
        if (!dest.enabled) continue;
        const mapped = mapMacroValue(value, dest);
        const out = this.applyTakeover(dest, value, mapped);
        if (out == null) continue;
        const intent = this.rateLimitIntent({
          destId: dest.id,
          roleId: dest.roleId,
          channel: dest.channel,
          cc: dest.cc,
          value: out,
          macroId: macro.id,
          label: dest.label,
        });
        if (intent) intents.push(intent);
      }
    }
    this.emit();
    return intents;
  }

  private applyTakeover(dest: SuperMacroDestination, source: number, mapped: number): number | null {
    const st = this.ensureDest(dest.id, dest.takeover);
    if (dest.takeover === 'direct') {
      st.pickupLatched = false;
      st.lastSource = source;
      st.prevMapped = mapped;
      return mapped;
    }
    if (dest.takeover === 'pickup') {
      if (st.lastSent == null) {
        st.pickupLatched = false;
        st.lastSource = source;
        st.prevMapped = mapped;
        return mapped;
      }
      if (st.pickupLatched) {
        const prev = st.prevMapped;
        const atTarget = Math.abs(mapped - st.lastSent) <= 1;
        const crossed =
          prev != null &&
          prev !== mapped &&
          (prev - st.lastSent) * (mapped - st.lastSent) < 0;
        st.prevMapped = mapped;
        st.lastSource = source;
        if (!atTarget && !crossed) return null;
        st.pickupLatched = false;
      } else {
        st.prevMapped = mapped;
        st.lastSource = source;
      }
      return mapped;
    }
    // relative: delta from last source applied to lastSent
    if (st.lastSource == null || st.lastSent == null) {
      st.lastSource = source;
      st.lastSent = mapped;
      st.prevMapped = mapped;
      return mapped;
    }
    const delta = source - st.lastSource;
    st.lastSource = source;
    const next = Math.min(127, Math.max(0, st.lastSent + delta));
    st.prevMapped = next;
    return next;
  }

  private rateLimitIntent(intent: CcOutIntent): CcOutIntent | null {
    const st = this.ensureDest(intent.destId, 'direct');
    const minGap = 1000 / Math.max(1, this.traffic.maxHz);
    const now = this.now();
    if (now - st.lastEmitAt >= minGap) {
      st.lastEmitAt = now;
      st.lastSent = intent.value;
      st.pending = null;
      this.pushMonitor(intent);
      return intent;
    }
    st.pending = intent.value;
    this.armFlush();
    return null;
  }

  private armFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      // Host must call flushPending() on a timer — we only coalesce here.
      // Clear timer if nothing pending.
      let any = false;
      for (const st of this.destRuntime.values()) {
        if (st.pending != null) any = true;
      }
      if (!any && this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      this.emit();
    }, 33);
  }

  /**
   * Emit coalesced pending values (call ~30 Hz from host).
   */
  flushPending(): CcOutIntent[] {
    if (this.traffic.disabled) return [];
    const now = this.now();
    const minGap = 1000 / Math.max(1, this.traffic.maxHz);
    const out: CcOutIntent[] = [];
    for (const macro of this.macros) {
      for (const dest of macro.destinations) {
        const st = this.destRuntime.get(dest.id);
        if (!st || st.pending == null) continue;
        if (now - st.lastEmitAt < minGap) continue;
        const value = st.pending;
        st.pending = null;
        st.lastEmitAt = now;
        st.lastSent = value;
        const intent: CcOutIntent = {
          destId: dest.id,
          roleId: dest.roleId,
          channel: dest.channel,
          cc: dest.cc,
          value,
          macroId: macro.id,
          label: dest.label,
        };
        this.pushMonitor(intent);
        out.push(intent);
      }
    }
    if (out.length) this.emit();
    return out;
  }

  private pushMonitor(intent: CcOutIntent): void {
    this.monitor = [
      {
        at: this.now(),
        text: `${intent.label} · ch${intent.channel} CC${intent.cc}=${intent.value}`,
        roleId: intent.roleId,
        channel: intent.channel,
        cc: intent.cc,
        value: intent.value,
      },
      ...this.monitor,
    ].slice(0, 40);
  }

  /** Capture current last-sent into scene A or B. */
  captureScene(which: 'a' | 'b'): void {
    const values: Record<string, number> = {};
    for (const m of this.macros) {
      for (const d of m.destinations) {
        const st = this.destRuntime.get(d.id);
        if (st?.lastSent != null) values[d.id] = st.lastSent;
      }
    }
    if (which === 'a') this.scenes = { ...this.scenes, a: { values } };
    else this.scenes = { ...this.scenes, b: { values } };
    this.emit();
  }

  startMorph(to: 'a' | 'b', opts?: { barQuantize?: boolean; currentBar?: number }): void {
    const target = to === 'a' ? this.scenes.a.values : this.scenes.b.values;
    const from: Record<string, number> = {};
    for (const id of Object.keys(target)) {
      from[id] = this.destRuntime.get(id)?.lastSent ?? target[id]!;
    }
    const barQuantize = opts?.barQuantize ?? this.scenes.barQuantize;
    const curBar = opts?.currentBar ?? this.currentBar;
    this.morph = {
      active: true,
      from,
      to: { ...target },
      startedAt: this.now(),
      durationMs: this.scenes.morphMs,
      curve: this.scenes.curve,
      waitBar: barQuantize ? curBar + 1 : null,
      cancelled: false,
    };
    this.emit();
  }

  cancelMorph(): void {
    if (!this.morph.active) return;
    this.morph = { ...this.morph, active: false, cancelled: true, waitBar: null };
    this.emit();
  }

  /**
   * Tick morph; returns CC intents for interpolated values.
   * Call from host animation frame / interval.
   */
  tickMorph(): CcOutIntent[] {
    if (!this.morph.active || this.traffic.disabled) return [];
    if (this.morph.waitBar != null) return [];
    const t = (this.now() - this.morph.startedAt) / Math.max(1, this.morph.durationMs);
    const u = applyCurve(Math.min(1, t), this.morph.curve);
    const intents: CcOutIntent[] = [];
    for (const [destId, toVal] of Object.entries(this.morph.to)) {
      const fromVal = this.morph.from[destId] ?? toVal;
      const value = Math.round(fromVal + (toVal - fromVal) * u);
      const dest = this.findDest(destId);
      if (!dest || !dest.enabled) continue;
      const intent = this.rateLimitIntent({
        destId,
        roleId: dest.roleId,
        channel: dest.channel,
        cc: dest.cc,
        value,
        macroId: 'morph',
        label: dest.label,
      });
      if (intent) intents.push(intent);
    }
    if (t >= 1) {
      this.morph = { ...this.morph, active: false };
    }
    this.emit();
    return intents;
  }

  private findDest(id: string): SuperMacroDestination | null {
    for (const m of this.macros) {
      const d = m.destinations.find((x) => x.id === id);
      if (d) return d;
    }
    return null;
  }

  /** Mark pickup as latched after external edit (soft takeover re-engage). */
  latchPickup(destId: string): void {
    const st = this.destRuntime.get(destId);
    if (st) {
      st.pickupLatched = true;
      this.emit();
    }
  }

  exportDiagnostic(): Record<string, unknown> {
    return {
      exportedAt: new Date().toISOString(),
      feature: 'cross-device-macros',
      honesty: 'experimental',
      disclaimer:
        'Opt-in Super Macros. A/B scenes are Splot-owned, not Circuit Scenes. Device parameter state is not verified from the wire — last-sent is what Splot transmitted. Hardware confirmation required.',
      snapshot: this.getSnapshot(),
      presets: SUPER_MACRO_PRESETS.map((p) => ({ id: p.id, cc: p.cc, honesty: p.honesty })),
    };
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export { CIRCUIT_MACRO_CCS, CTRL_DEVICES, KNOB_TARGETS };
export type { KnobTarget };
