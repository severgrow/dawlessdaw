import { describe, it, expect } from 'vitest';
import {
  filterSelectableAudioInputs,
  formatInputLabel,
  hintForLabel,
  isBuiltInOrPhoneMic,
  pickPreferredInputId,
  PLUG_IN_INTERFACE,
} from './devices';

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

describe('built-in / phone mic exclusion', () => {
  it('flags MacBook, iPhone, Continuity, default/communications', () => {
    expect(isBuiltInOrPhoneMic('MacBook Pro Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('MacBook Air Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('iPhone Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('iPad Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Continuity Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Built-in Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Internal Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Microphone Array (Realtek)')).toBe(true);
    expect(isBuiltInOrPhoneMic('Default - MacBook Pro Microphone')).toBe(true);
    expect(isBuiltInOrPhoneMic('Something', 'default')).toBe(true);
    expect(isBuiltInOrPhoneMic('Something', 'communications')).toBe(true);
  });

  it('keeps Scarlett / ZED / USB interfaces', () => {
    expect(isBuiltInOrPhoneMic('Scarlett 2i4 USB')).toBe(false);
    expect(isBuiltInOrPhoneMic('USB Audio CODEC')).toBe(false);
    expect(isBuiltInOrPhoneMic('Allen & Heath ZED-10FX')).toBe(false);
  });

  it('filters pickers and prefers interfaces; empty when only built-ins', () => {
    const onlyBuiltIn = filterSelectableAudioInputs([
      { deviceId: 'default', label: 'Default - MacBook Pro Microphone' },
      { deviceId: 'mb', label: 'MacBook Pro Microphone' },
      { deviceId: 'phone', label: 'iPhone Microphone' },
    ]);
    expect(onlyBuiltIn).toEqual([]);
    expect(pickPreferredInputId(onlyBuiltIn)).toBeNull();
    expect(PLUG_IN_INTERFACE).toMatch(/plug in/i);

    const mixed = filterSelectableAudioInputs([
      { deviceId: 'mb', label: 'MacBook Pro Microphone' },
      { deviceId: 'other', label: 'Some USB Gadget' },
      { deviceId: 'scar', label: 'Scarlett 2i2' },
      { deviceId: 'zed', label: 'ZED-10FX' },
    ]);
    expect(mixed.map((d) => d.deviceId)).toEqual(['scar', 'zed', 'other']);
    expect(pickPreferredInputId(mixed, 'zed')).toBe('zed');
    expect(pickPreferredInputId(mixed)).toBe('scar');
  });
});
