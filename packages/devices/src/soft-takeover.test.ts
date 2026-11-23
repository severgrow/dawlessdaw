import { describe, expect, it } from 'vitest';
import {
  applySoftTakeover,
  effectiveTakeoverMode,
  emptySoftTakeoverState,
  markSoftTakeoverSent,
} from './soft-takeover';

describe('soft-takeover (Phase 2 / M3 shared)', () => {
  it('direct always passes mapped value', () => {
    let st = emptySoftTakeoverState('direct');
    const r = applySoftTakeover('direct', st, 40, 80);
    expect(r.value).toBe(80);
    st = markSoftTakeoverSent(r.state, 80, 'direct');
    expect(applySoftTakeover('direct', st, 10, 20).value).toBe(20);
  });

  it('pickup passes first value when nothing sent yet', () => {
    const st = emptySoftTakeoverState('pickup');
    const r = applySoftTakeover('pickup', st, 0, 0);
    expect(r.value).toBe(0);
    expect(r.state.pickupLatched).toBe(false);
  });

  it('pickup holds until mapped reaches lastSent', () => {
    let st = emptySoftTakeoverState('pickup');
    st = markSoftTakeoverSent({ ...st, pickupLatched: false, lastSent: 64 }, 64, 'pickup');
    // Re-latch as if destination jumped / mode just enabled
    st = { ...st, pickupLatched: true, prevMapped: 0 };

    const blocked = applySoftTakeover('pickup', st, 10, 10);
    expect(blocked.value).toBeNull();
    expect(blocked.state.pickupLatched).toBe(true);

    const near = applySoftTakeover('pickup', blocked.state, 63, 63);
    expect(near.value).toBe(63);
    expect(near.state.pickupLatched).toBe(false);
  });

  it('pickup unlatches when mapped crosses lastSent', () => {
    let st = emptySoftTakeoverState('pickup');
    st = {
      lastSent: 50,
      pickupLatched: true,
      prevMapped: 40,
      lastSource: 40,
    };
    const crossed = applySoftTakeover('pickup', st, 60, 60);
    expect(crossed.value).toBe(60);
    expect(crossed.state.pickupLatched).toBe(false);
  });

  it('relative applies source delta to lastSent', () => {
    let st = emptySoftTakeoverState('relative');
    st = markSoftTakeoverSent(
      { lastSent: 40, pickupLatched: false, prevMapped: 40, lastSource: 20 },
      40,
      'relative',
    );
    st = { ...st, lastSource: 20 };
    const r = applySoftTakeover('relative', st, 30, 99);
    expect(r.value).toBe(50); // 40 + (30-20)
  });

  it('Controller pickup off leaves modes unchanged (default)', () => {
    expect(effectiveTakeoverMode('direct', false)).toBe('direct');
    expect(effectiveTakeoverMode('pickup', false)).toBe('pickup');
    expect(effectiveTakeoverMode('relative', false)).toBe('relative');
  });

  it('Controller pickup on promotes direct → pickup only', () => {
    expect(effectiveTakeoverMode('direct', true)).toBe('pickup');
    expect(effectiveTakeoverMode('pickup', true)).toBe('pickup');
    expect(effectiveTakeoverMode('relative', true)).toBe('relative');
  });
});
