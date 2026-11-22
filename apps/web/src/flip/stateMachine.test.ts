import { describe, it, expect } from 'vitest';
import {
  armWaiting,
  canCancel,
  initialFlipMachine,
  transition,
} from './stateMachine';

describe('FLIP state machine', () => {
  it('Idle → Armed → WaitingBoundary → Recording → Processing → Ready', () => {
    let s = initialFlipMachine();
    expect(s.phase).toBe('idle');
    s = transition(s, { type: 'ARM' });
    expect(s.phase).toBe('armed');
    s = armWaiting(s);
    expect(s.phase).toBe('waiting_boundary');
    s = transition(s, { type: 'BOUNDARY' });
    expect(s.phase).toBe('recording');
    expect(s.lastQuantized).toBe(true);
    s = transition(s, { type: 'STOP_REC' });
    expect(s.phase).toBe('processing');
    s = transition(s, { type: 'PROCESS_DONE' });
    expect(s.phase).toBe('ready');
  });

  it('free START_REC from armed is unquantised', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    s = transition(s, { type: 'START_REC' });
    expect(s.phase).toBe('recording');
    expect(s.lastQuantized).toBe(false);
  });

  it('cancel from active states', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    expect(canCancel(s.phase)).toBe(true);
    s = transition(s, { type: 'CANCEL' });
    expect(s.phase).toBe('cancelled');
    s = transition(s, { type: 'CLEAR' });
    expect(s.phase).toBe('idle');
  });

  it('error path from processing', () => {
    let s = transition(initialFlipMachine(), { type: 'ARM' });
    s = transition(s, { type: 'START_REC' });
    s = transition(s, { type: 'STOP_REC' });
    s = transition(s, { type: 'PROCESS_FAIL', message: 'boom' });
    expect(s.phase).toBe('error');
    expect(s.error).toBe('boom');
  });

  it('ignores illegal transitions', () => {
    const s = initialFlipMachine();
    expect(transition(s, { type: 'BOUNDARY' }).phase).toBe('idle');
    expect(transition(s, { type: 'STOP_REC' }).phase).toBe('idle');
  });
});
