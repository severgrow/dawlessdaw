import { describe, expect, it } from 'vitest';
import {
  resolveMpcDinNextAction,
  saveMpcDinCableConfirmed,
  loadMpcDinCableConfirmed,
  saveMpcDinPrefsConfirmed,
  loadMpcDinPrefsConfirmed,
  MPC_DIN_CABLE_KEY,
  MPC_DIN_PREFS_KEY,
} from './mpcDinSetup';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

describe('resolveMpcDinNextAction', () => {
  it('asks for App sends notes when thru-box only', () => {
    const a = resolveMpcDinNextAction({
      mpcNoteMode: 'din-only',
      mpcOutPortName: 'Scarlett 2i4 USB',
      clockToMpc: false,
      cableConfirmed: false,
      devicePrefsConfirmed: false,
    });
    expect(a.step).toBe('app-sends-notes');
    expect(a.cta).toMatch(/App sends notes/i);
  });

  it('asks for Scarlett Out when unset', () => {
    const a = resolveMpcDinNextAction({
      mpcNoteMode: 'usb',
      mpcOutPortName: null,
      clockToMpc: false,
      cableConfirmed: false,
      devicePrefsConfirmed: false,
    });
    expect(a.step).toBe('ports-scarlett');
    expect(a.hint.toLowerCase()).toMatch(/scarlett/);
  });

  it('blocks on USB-B honesty when MPC USB is selected', () => {
    const a = resolveMpcDinNextAction({
      mpcNoteMode: 'usb',
      mpcOutPortName: 'MPC One',
      clockToMpc: false,
      cableConfirmed: true,
      devicePrefsConfirmed: true,
    });
    expect(a.step).toBe('usb-b-honesty');
    expect(a.usbBUseless).toBe(true);
    expect(a.cta.toLowerCase()).toMatch(/usb-b|useless/);
  });

  it('progresses cable → device prefs → optional clock', () => {
    const base = {
      mpcNoteMode: 'usb' as const,
      mpcOutPortName: 'Scarlett 2i4 USB',
      clockToMpc: false,
      cableConfirmed: false,
      devicePrefsConfirmed: false,
    };
    expect(resolveMpcDinNextAction(base).step).toBe('cable');
    expect(
      resolveMpcDinNextAction({ ...base, cableConfirmed: true }).step,
    ).toBe('mpc-device-prefs');
    expect(
      resolveMpcDinNextAction({
        ...base,
        cableConfirmed: true,
        devicePrefsConfirmed: true,
      }).step,
    ).toBe('clock-follow-optin');
    expect(
      resolveMpcDinNextAction({
        ...base,
        cableConfirmed: true,
        devicePrefsConfirmed: true,
        clockToMpc: true,
      }).step,
    ).toBe('ready');
  });

  it('never implies clock default — ready only when follow already on', () => {
    const a = resolveMpcDinNextAction({
      mpcNoteMode: 'usb',
      mpcOutPortName: 'Focusrite Scarlett 2i4',
      clockToMpc: false,
      cableConfirmed: true,
      devicePrefsConfirmed: true,
    });
    expect(a.step).toBe('clock-follow-optin');
    expect(a.hint.toLowerCase()).toMatch(/opt-in|never default/);
  });

  it('persists cable / prefs flags', () => {
    const s = mem();
    expect(loadMpcDinCableConfirmed(s)).toBe(false);
    saveMpcDinCableConfirmed(true, s);
    expect(s.getItem(MPC_DIN_CABLE_KEY)).toBe('1');
    expect(loadMpcDinCableConfirmed(s)).toBe(true);
    saveMpcDinPrefsConfirmed(true, s);
    expect(s.getItem(MPC_DIN_PREFS_KEY)).toBe('1');
    expect(loadMpcDinPrefsConfirmed(s)).toBe(true);
  });
});
