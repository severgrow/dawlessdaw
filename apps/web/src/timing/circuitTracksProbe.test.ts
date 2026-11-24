import { expect, it } from 'vitest';
import { circuitTracksNote } from './circuitTracksProbe';

it('decodes Tracks factory channels without guessing individual drums', () => {
  expect(circuitTracksNote([0x90, 60, 90])).toEqual({ channel: 1, label: 'Synth 1', pitch: 60, velocity: 90 });
  expect(circuitTracksNote([0x93, 61, 70])?.label).toBe('MIDI 2');
  expect(circuitTracksNote([0x99, 60, 100])?.label).toBe('Drums 1–4 · Shared');
  expect(circuitTracksNote([0x99, 65, 100])?.label).toBe('Drums 1–4 · Shared');
  expect(circuitTracksNote([0x94, 50, 90])?.label).toBe('Outside factory mapping');
  expect(circuitTracksNote([0x99, 60, 0])).toBeNull();
  expect(circuitTracksNote([0x89, 60, 100])).toBeNull();
});
