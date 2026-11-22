import { describe, it, expect } from 'vitest';
import { formatRouteChannelDetail } from './routeChannelDetail';

describe('formatRouteChannelDetail', () => {
  it('shows remapped dest channel (Circuit T1 → MPC ch9)', () => {
    expect(formatRouteChannelDetail({ allow: [1], remap: { 1: 9 } })).toBe(' · ch 1→9');
  });

  it('keeps plain filter when remap is identity or absent (T5/T6 → FM1)', () => {
    expect(formatRouteChannelDetail({ allow: [5], remap: { 5: 5 } })).toBe(' · ch 5');
    expect(formatRouteChannelDetail({ allow: [6], remap: { 6: 6 } })).toBe(' · ch 6');
    expect(formatRouteChannelDetail({ allow: [1] })).toBe(' · ch 1');
  });

  it('returns empty when no allow list', () => {
    expect(formatRouteChannelDetail(undefined)).toBe('');
    expect(formatRouteChannelDetail({ remap: { 6: 13 } })).toBe('');
  });
});
