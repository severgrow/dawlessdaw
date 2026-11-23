import { describe, expect, it, beforeEach } from 'vitest';
import {
  carryControllerTrack,
  carrySetupRole,
  clearUiChip,
  getUiSelection,
  setUiSelection,
} from './uiSelection';

describe('uiSelection', () => {
  beforeEach(() => {
    setUiSelection({ controllerTrack: 1, setupRoleId: null, chip: null });
  });

  it('clamps controller track to 1–8', () => {
    setUiSelection({ controllerTrack: 99 });
    expect(getUiSelection().controllerTrack).toBe(8);
    setUiSelection({ controllerTrack: 0 });
    expect(getUiSelection().controllerTrack).toBe(1);
  });

  it('carries Rig track to Controller', () => {
    carryControllerTrack(3, 'T3 → SP A');
    const s = getUiSelection();
    expect(s.controllerTrack).toBe(3);
    expect(s.chip).toBe('T3 → SP A');
  });

  it('carries Setup role + clears chip', () => {
    carrySetupRole('mpc', 'Ports · MPC');
    expect(getUiSelection().setupRoleId).toBe('mpc');
    clearUiChip();
    expect(getUiSelection().chip).toBeNull();
    expect(getUiSelection().setupRoleId).toBe('mpc');
  });
});
