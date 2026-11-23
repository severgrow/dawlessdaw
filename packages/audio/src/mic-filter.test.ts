import { describe, expect, it } from 'vitest';
import {
  filterSelectableAudioInputs,
  isBuiltInOrPhoneMic,
  isPreferredInterface,
} from './mic-filter';

describe('isBuiltInOrPhoneMic', () => {
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

  it('allows interface / mixer names', () => {
    expect(isBuiltInOrPhoneMic('Scarlett 2i2 USB')).toBe(false);
    expect(isBuiltInOrPhoneMic('Allen & Heath ZED-10FX')).toBe(false);
    expect(isBuiltInOrPhoneMic('SP-404MKII')).toBe(false);
  });
});

describe('filterSelectableAudioInputs', () => {
  it('drops built-ins and prefers Scarlett/ZED', () => {
    const out = filterSelectableAudioInputs([
      { deviceId: 'm', label: 'MacBook Pro Microphone' },
      { deviceId: 's', label: 'Scarlett 2i2 USB' },
      { deviceId: 'z', label: 'Allen & Heath ZED-10FX' },
      { deviceId: 'c', label: 'Continuity Microphone' },
    ]);
    expect(out.map((d) => d.deviceId)).toEqual(['z', 's']);
  });

  it('isPreferredInterface tags USB gear', () => {
    expect(isPreferredInterface('Focusrite Scarlett 4i4')).toBe(true);
    expect(isPreferredInterface('Random Mic')).toBe(false);
  });
});
