import { describe, it, expect } from 'vitest';
import { formatInputLabel, hintForLabel } from './devices';

describe('audio input hints', () => {
  it('tags ZED / Scarlett / SP when names match', () => {
    expect(hintForLabel('Allen & Heath ZED-10FX')).toBe('zed');
    expect(hintForLabel('Scarlett 2i4 USB')).toBe('scarlett');
    expect(hintForLabel('SP-404MKII')).toBe('sp404');
    expect(hintForLabel('MacBook Pro Microphone')).toBe('other');
  });

  it('formats labels with hints', () => {
    expect(
      formatInputLabel({ deviceId: '1', label: 'ZED-10FX', hint: 'zed' }),
    ).toContain('ZED');
  });
});
