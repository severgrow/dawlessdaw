import { describe, expect, it } from 'vitest';
import {
  bumpSpTick,
  emptySpLiveTicks,
  isSpModeABank,
  spModeAChannel,
  spModeANoteToPad,
  spModeAPadNote,
  SP_SETUP_STEPS,
} from './sp404-setup';
import {
  defaultSpEffectProfile,
  normalizeSpEffectProfile,
  setEffectKnobLabel,
} from './sp-effect-names';

describe('sp404-setup', () => {
  it('has Mode A / clock checklist steps', () => {
    expect(SP_SETUP_STEPS.some((s) => s.id === 'mode-a')).toBe(true);
    expect(SP_SETUP_STEPS.some((s) => s.id === 'clock-ext')).toBe(true);
  });

  it('maps Mode A banks to channels 1–10', () => {
    expect(spModeAChannel('A')).toBe(1);
    expect(spModeAChannel('J')).toBe(10);
    expect(isSpModeABank('K')).toBe(false);
  });

  it('maps pad ↔ note 36–51', () => {
    expect(spModeAPadNote(1)).toBe(36);
    expect(spModeAPadNote(16)).toBe(51);
    expect(spModeANoteToPad(36)).toBe(1);
    expect(spModeANoteToPad(20)).toBeNull();
  });

  it('bumps live ticks', () => {
    let t = emptySpLiveTicks();
    t = bumpSpTick(t, 'note', 100);
    expect(t.note.count).toBe(1);
    expect(t.note.lastAt).toBe(100);
  });
});

describe('sp-effect-names', () => {
  it('defaults eight CTRL CCs as docs-backed, not verified', () => {
    const p = defaultSpEffectProfile(7);
    expect(p.knobs).toHaveLength(8);
    expect(p.ownerVerified).toBe(false);
    expect(p.knobs.every((k) => k.honesty !== 'verified')).toBe(true);
  });

  it('naming resets ownerVerified and keeps honesty untested', () => {
    const named = setEffectKnobLabel(defaultSpEffectProfile(), 16, 'Filter');
    expect(named.knobs.find((k) => k.cc === 16)?.label).toBe('Filter');
    expect(named.ownerVerified).toBe(false);
    expect(named.knobs.find((k) => k.cc === 16)?.honesty).toBe('untested');
  });

  it('normalize strips fake verified without owner flag', () => {
    const p = normalizeSpEffectProfile({
      version: 1,
      ownerVerified: false,
      knobs: [{ cc: 16, label: 'X', honesty: 'verified' }],
    });
    expect(p.knobs.find((k) => k.cc === 16)?.honesty).toBe('untested');
  });
});
