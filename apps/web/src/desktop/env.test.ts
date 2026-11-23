import { afterEach, describe, expect, it } from 'vitest';
import { isSplotDesktop } from './env';

describe('isSplotDesktop', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('is false without window', () => {
    expect(isSplotDesktop()).toBe(false);
  });

  it('is true when preload exposed splotDesktop', () => {
    (globalThis as { window: unknown }).window = { splotDesktop: { isDesktop: true } };
    expect(isSplotDesktop()).toBe(true);
  });

  it('is false in plain browser', () => {
    (globalThis as { window: unknown }).window = {};
    expect(isSplotDesktop()).toBe(false);
  });
});
