/**
 * Shared soft-takeover (pickup) for Circuit macro → destination CCs.
 *
 * Used by Super Macros (M3) and Controller knob pickup (Phase 2).
 * Default for Controller is **off** — host must opt in.
 *
 * Pickup: hold outbound until the mapped value reaches / crosses lastSent,
 * so twisting a physical knob does not jump the destination parameter.
 */

export type SoftTakeoverMode = 'direct' | 'pickup' | 'relative';

export interface SoftTakeoverState {
  lastSent: number | null;
  /** True while waiting for the source to catch up to lastSent. */
  pickupLatched: boolean;
  prevMapped: number | null;
  lastSource: number | null;
}

export function emptySoftTakeoverState(mode: SoftTakeoverMode = 'direct'): SoftTakeoverState {
  return {
    lastSent: null,
    pickupLatched: mode === 'pickup',
    prevMapped: null,
    lastSource: null,
  };
}

export interface SoftTakeoverResult {
  /** Mapped value to send, or null when pickup is still waiting. */
  value: number | null;
  state: SoftTakeoverState;
}

/**
 * Apply soft takeover to a already-mapped 0–127 value.
 * `source` is the raw Circuit knob 0–127 (needed for relative mode).
 */
export function applySoftTakeover(
  mode: SoftTakeoverMode,
  state: SoftTakeoverState,
  source: number,
  mapped: number,
): SoftTakeoverResult {
  const st: SoftTakeoverState = { ...state };

  if (mode === 'direct') {
    st.pickupLatched = false;
    st.lastSource = source;
    st.prevMapped = mapped;
    return { value: mapped, state: st };
  }

  if (mode === 'pickup') {
    if (st.lastSent == null) {
      st.pickupLatched = false;
      st.lastSource = source;
      st.prevMapped = mapped;
      return { value: mapped, state: st };
    }
    if (st.pickupLatched) {
      const prev = st.prevMapped;
      const atTarget = Math.abs(mapped - st.lastSent) <= 1;
      const crossed =
        prev != null && prev !== mapped && (prev - st.lastSent) * (mapped - st.lastSent) < 0;
      st.prevMapped = mapped;
      st.lastSource = source;
      if (!atTarget && !crossed) return { value: null, state: st };
      st.pickupLatched = false;
    } else {
      st.prevMapped = mapped;
      st.lastSource = source;
    }
    return { value: mapped, state: st };
  }

  // relative: delta from last source applied to lastSent
  if (st.lastSource == null || st.lastSent == null) {
    st.lastSource = source;
    st.lastSent = mapped;
    st.prevMapped = mapped;
    return { value: mapped, state: st };
  }
  const delta = source - st.lastSource;
  st.lastSource = source;
  const next = Math.min(127, Math.max(0, st.lastSent + delta));
  st.prevMapped = next;
  return { value: next, state: st };
}

/** After a value is actually sent, update lastSent (and re-latch on mode change to pickup). */
export function markSoftTakeoverSent(
  state: SoftTakeoverState,
  sent: number,
  mode: SoftTakeoverMode,
): SoftTakeoverState {
  return {
    ...state,
    lastSent: sent,
    // Stay unlatched after a successful send; next mode switch to pickup re-latches via emptySoftTakeoverState / ensure.
    pickupLatched: mode === 'pickup' ? state.pickupLatched : false,
  };
}

/**
 * Controller Phase 2: when soft takeover is enabled, treat `direct` as `pickup`.
 * Relative stays relative. Off → leave mode unchanged.
 */
export function effectiveTakeoverMode(
  configured: SoftTakeoverMode,
  controllerPickupOn: boolean,
): SoftTakeoverMode {
  if (!controllerPickupOn) return configured;
  if (configured === 'direct') return 'pickup';
  return configured;
}
