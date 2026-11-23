import { describe, expect, it } from 'vitest';
import { resolveNextAction } from './nextAction';

describe('resolveNextAction', () => {
  it('asks for MIDI first', () => {
    const a = resolveNextAction({
      midiReady: false,
      midiError: 'denied',
      connectedPorts: 0,
      onboardingStep: 'connect',
    });
    expect(a.kind).toBe('allow-midi');
    expect(a.cta).toBe('Allow MIDI');
    expect(a.hint).toMatch(/Chrome|Allow MIDI/i);
  });

  it('asks for ports when MIDI is on but not ready to play', () => {
    const a = resolveNextAction({
      midiReady: true,
      midiError: null,
      connectedPorts: 2,
      onboardingStep: 'assign',
    });
    expect(a.kind).toBe('assign-ports');
  });

  it('is ready when MIDI + play step', () => {
    const a = resolveNextAction({
      midiReady: true,
      midiError: null,
      connectedPorts: 3,
      onboardingStep: 'play',
    });
    expect(a.kind).toBe('ready');
  });
});
