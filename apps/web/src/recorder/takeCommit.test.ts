import { describe, expect, it, vi } from 'vitest';
import { commitTakeKeepingRecovery, mayClearRecovery } from './takeCommit';

describe('takeCommit P1 — never clear recovery before verified save', () => {
  it('mayClearRecovery is false when save or verify fails', () => {
    expect(mayClearRecovery(false, true)).toBe(false);
    expect(mayClearRecovery(true, false)).toBe(false);
    expect(mayClearRecovery(true, undefined)).toBe(true);
    expect(mayClearRecovery(true, true)).toBe(true);
  });

  it('clears recovery only after successful save', async () => {
    const clearRecovery = vi.fn(async () => undefined);
    const phase = await commitTakeKeepingRecovery({
      save: async () => true,
      clearRecovery,
    });
    expect(phase).toBe('saved_and_cleared');
    expect(clearRecovery).toHaveBeenCalledTimes(1);
  });

  it('failure injection: save returns false → recovery kept', async () => {
    const clearRecovery = vi.fn(async () => undefined);
    const phase = await commitTakeKeepingRecovery({
      save: async () => false,
      clearRecovery,
    });
    expect(phase).toBe('save_failed');
    expect(clearRecovery).not.toHaveBeenCalled();
  });

  it('failure injection: save throws → recovery kept', async () => {
    const clearRecovery = vi.fn(async () => undefined);
    const phase = await commitTakeKeepingRecovery({
      save: async () => {
        throw new Error('disk full');
      },
      clearRecovery,
    });
    expect(phase).toBe('save_failed');
    expect(clearRecovery).not.toHaveBeenCalled();
  });

  it('failure injection: verify fails → recovery kept', async () => {
    const clearRecovery = vi.fn(async () => undefined);
    const phase = await commitTakeKeepingRecovery({
      save: async () => true,
      verify: async () => false,
      clearRecovery,
    });
    expect(phase).toBe('verify_failed');
    expect(clearRecovery).not.toHaveBeenCalled();
  });

  it('verify success then clears', async () => {
    const clearRecovery = vi.fn(async () => undefined);
    const phase = await commitTakeKeepingRecovery({
      save: async () => true,
      verify: async () => true,
      clearRecovery,
    });
    expect(phase).toBe('saved_and_cleared');
    expect(clearRecovery).toHaveBeenCalledTimes(1);
  });
});
