/**
 * Pure FLIP capture state machine.
 * Idle → Armed → WaitingBoundary → Recording → Processing → Ready
 * (+ cancel / error from active states).
 */
import type { FlipPhase } from './types';

export type FlipEvent =
  | { type: 'ARM' }
  | { type: 'DISARM' }
  | { type: 'BOUNDARY' }
  | { type: 'START_REC' }
  | { type: 'STOP_REC' }
  | { type: 'PROCESS_DONE' }
  | { type: 'PROCESS_FAIL'; message?: string }
  | { type: 'CANCEL' }
  | { type: 'CLEAR' }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

export interface FlipMachineState {
  phase: FlipPhase;
  error: string | null;
  lastQuantized: boolean;
}

export function initialFlipMachine(): FlipMachineState {
  return { phase: 'idle', error: null, lastQuantized: false };
}

const ACTIVE: ReadonlySet<FlipPhase> = new Set([
  'armed',
  'waiting_boundary',
  'recording',
  'processing',
]);

export function canCancel(phase: FlipPhase): boolean {
  return ACTIVE.has(phase);
}

export function transition(
  state: FlipMachineState,
  event: FlipEvent,
): FlipMachineState {
  const { phase } = state;

  switch (event.type) {
    case 'ARM':
      if (phase === 'idle' || phase === 'ready' || phase === 'cancelled' || phase === 'error') {
        return { phase: 'armed', error: null, lastQuantized: false };
      }
      return state;

    case 'DISARM':
      if (phase === 'armed' || phase === 'waiting_boundary') {
        return { phase: 'idle', error: null, lastQuantized: state.lastQuantized };
      }
      return state;

    case 'BOUNDARY':
      if (phase === 'armed' || phase === 'waiting_boundary') {
        return { phase: 'recording', error: null, lastQuantized: true };
      }
      return state;

    case 'START_REC':
      if (phase === 'armed' || phase === 'waiting_boundary') {
        return {
          phase: 'recording',
          error: null,
          lastQuantized: phase === 'waiting_boundary' ? state.lastQuantized : false,
        };
      }
      return state;

    case 'STOP_REC':
      if (phase === 'recording') {
        return { ...state, phase: 'processing', error: null };
      }
      return state;

    case 'PROCESS_DONE':
      if (phase === 'processing') {
        return { ...state, phase: 'ready', error: null };
      }
      return state;

    case 'PROCESS_FAIL':
      if (phase === 'processing' || phase === 'recording') {
        return {
          phase: 'error',
          error: event.message ?? 'Processing failed',
          lastQuantized: state.lastQuantized,
        };
      }
      return state;

    case 'CANCEL':
      if (canCancel(phase)) {
        return { phase: 'cancelled', error: null, lastQuantized: false };
      }
      return state;

    case 'CLEAR':
      if (phase === 'ready' || phase === 'cancelled' || phase === 'error') {
        return { phase: 'idle', error: null, lastQuantized: false };
      }
      return state;

    case 'ERROR':
      return { phase: 'error', error: event.message, lastQuantized: state.lastQuantized };

    case 'RESET':
      return initialFlipMachine();

    default:
      return state;
  }
}

export function armWaiting(state: FlipMachineState): FlipMachineState {
  if (state.phase !== 'armed') return state;
  return { ...state, phase: 'waiting_boundary', error: null };
}

export function phaseLabel(phase: FlipPhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'armed':
      return 'Armed';
    case 'waiting_boundary':
      return 'Waiting bar';
    case 'recording':
      return 'Recording';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return 'Error';
    default:
      return phase;
  }
}
