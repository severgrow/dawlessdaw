import { describe, expect, it } from 'vitest';
import { DESKTOP_PERMISSIONS, isDesktopPermissionAllowed } from './permissions.mjs';

describe('desktop permissions', () => {
  it('allows MIDI and audio capture needed by the Vite app', () => {
    expect(isDesktopPermissionAllowed('midi')).toBe(true);
    expect(isDesktopPermissionAllowed('midiSysex')).toBe(true);
    expect(isDesktopPermissionAllowed('media')).toBe(true);
    expect(isDesktopPermissionAllowed('microphone')).toBe(true);
    expect(isDesktopPermissionAllowed('audioCapture')).toBe(true);
  });

  it('denies unrelated browser permissions', () => {
    expect(isDesktopPermissionAllowed('geolocation')).toBe(false);
    expect(isDesktopPermissionAllowed('notifications')).toBe(false);
    expect(isDesktopPermissionAllowed('camera')).toBe(false);
    expect(isDesktopPermissionAllowed('clipboard-read')).toBe(false);
  });

  it('exposes a frozen allowlist size for regression checks', () => {
    expect(DESKTOP_PERMISSIONS.size).toBe(5);
  });
});
