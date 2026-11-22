import { describe, it, expect, beforeEach } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import {
  DEVICE_PROFILE_SCHEMA_VERSION,
  PROFILE_HONESTY_LABEL,
  addControl,
  applyLearnToControl,
  createGenericProfile,
  exportProfileBundleJson,
  exportProfileJson,
  honestyFromCapabilities,
  importProfileBundleJson,
  importProfileJson,
  loadCustomProfiles,
  nextOnboardingStep,
  plainClockHint,
  removeControl,
  restoreCustomProfilePorts,
  saveCustomProfiles,
  sanitizeGenericProfile,
} from './generic-profile';
import { controlMappingKey, isLearnGlassIgnoredMidi } from './controller';
import { isAmbiguousPortMatch, matchPortsToRoles } from './port-matcher';
import { MY_STUDIO_ROLES } from './studio-layout';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('generic profile schema', () => {
  it('creates a Generic honesty profile with no fake controls', () => {
    const r = createGenericProfile({ displayName: 'Mystery Box', category: 'synth', colour: '#4a7c59' });
    expect(r.ok).toBe(true);
    expect(r.profile!.schemaVersion).toBe(DEVICE_PROFILE_SCHEMA_VERSION);
    expect(r.profile!.honesty).toBe('generic');
    expect(r.profile!.controls).toEqual([]);
    expect(r.profile!.capabilities[0]!.status).toBe('unknown');
    expect(PROFILE_HONESTY_LABEL.generic).toMatch(/no invented controls/i);
  });

  it('rejects bad schemaVersion, colour, channel, and executable-looking fields', () => {
    expect(sanitizeGenericProfile({ schemaVersion: 99, id: 'x', displayName: 'A' }).ok).toBe(false);
    expect(
      sanitizeGenericProfile({
        schemaVersion: 1,
        id: 'ok-id',
        displayName: 'A',
        category: 'other',
        colour: 'red',
        channel: 1,
        honesty: 'generic',
      }).errors.join(' '),
    ).toMatch(/colour/);
    expect(
      sanitizeGenericProfile({
        schemaVersion: 1,
        id: 'ok-id',
        displayName: 'A',
        category: 'other',
        colour: '#fff',
        channel: 99,
        honesty: 'generic',
      }).errors.join(' '),
    ).toMatch(/channel/);
    expect(
      sanitizeGenericProfile({
        schemaVersion: 1,
        id: 'ok-id',
        displayName: 'A',
        category: 'other',
        colour: '#fff',
        channel: 1,
        honesty: 'generic',
        eval: 'alert(1)',
      }).errors.join(' '),
    ).toMatch(/Forbidden/);
  });

  it('strips verified capability status when honesty is generic', () => {
    const r = sanitizeGenericProfile({
      schemaVersion: 1,
      id: 'g1',
      displayName: 'Box',
      category: 'other',
      colour: '#abc',
      channel: 1,
      honesty: 'generic',
      capabilities: [{ id: 'midi-io', label: 'MIDI', status: 'verified' }],
    });
    expect(r.ok).toBe(true);
    expect(r.profile!.capabilities[0]!.status).toBe('unknown');
  });

  it('import/export round-trips a single profile', () => {
    const created = createGenericProfile({
      displayName: 'Nord Clone',
      manufacturer: 'Acme',
      category: 'synth',
      colour: '#336699',
      channel: 3,
      inputPortName: 'Acme MIDI',
      outputPortName: 'Acme MIDI',
      portNameHints: ['acme'],
      honesty: 'documented',
    });
    const json = exportProfileJson(created.profile!);
    const back = importProfileJson(json);
    expect(back.ok).toBe(true);
    expect(back.profile!.displayName).toBe('Nord Clone');
    expect(back.profile!.channel).toBe(3);
    expect(back.profile!.honesty).toBe('documented');
  });

  it('import/export bundle + localStorage persistence', () => {
    const store = memoryStorage();
    const a = createGenericProfile({ displayName: 'A', colour: '#111111' }).profile!;
    const b = createGenericProfile({ displayName: 'B', colour: '#222222' }).profile!;
    saveCustomProfiles([a, b], store);
    const loaded = loadCustomProfiles(store);
    expect(loaded.map((p) => p.displayName).sort()).toEqual(['A', 'B']);
    const bundle = importProfileBundleJson(exportProfileBundleJson(loaded));
    expect(bundle.ok).toBe(true);
    expect(bundle.bundle!.profiles).toHaveLength(2);
  });

  it('rejects invalid JSON and HTML/script payloads', () => {
    expect(importProfileJson('{').errors[0]).toMatch(/Invalid JSON/);
    expect(importProfileJson('<script>alert(1)</script>').ok).toBe(false);
    expect(importProfileBundleJson('{"kind":"evil","schemaVersion":1,"profiles":[]}').ok).toBe(false);
  });

  it('rejects unknown control fields (no code-shaped blobs)', () => {
    const base = createGenericProfile({ displayName: 'X' }).profile!;
    const bad = sanitizeGenericProfile({
      ...base,
      controls: [{ id: 'c1', label: 'Filter', cc: 74, onChange: 'evil()' }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/unknown field/);
  });
});

describe('unknown-device ports · reconnect · ambiguous', () => {
  const ports: MidiPortInfo[] = [
    { id: 'u-in', name: 'USB MIDI Device', type: 'input', state: 'connected' },
    { id: 'u-out', name: 'USB MIDI Device', type: 'output', state: 'connected' },
    { id: 'x-in', name: 'Mystery In', type: 'input', state: 'connected' },
    { id: 'x-out', name: 'Mystery Out', type: 'output', state: 'connected' },
  ];

  it('restores by remembered port name after id change (reconnect)', () => {
    const profile = createGenericProfile({
      displayName: 'Mystery',
      inputPortName: 'Mystery In',
      outputPortName: 'Mystery Out',
      portNameHints: ['mystery'],
    }).profile!;
    const first = restoreCustomProfilePorts(profile, ports);
    expect(first.inputPortId).toBe('x-in');
    expect(first.outputPortId).toBe('x-out');
    expect(first.ambiguous).toBe(false);

    // Same names, new ids (browser re-enumerate)
    const rejoined: MidiPortInfo[] = [
      { id: 'new-in', name: 'Mystery In', type: 'input', state: 'connected' },
      { id: 'new-out', name: 'Mystery Out', type: 'output', state: 'connected' },
    ];
    const again = restoreCustomProfilePorts(profile, rejoined);
    expect(again.inputPortId).toBe('new-in');
    expect(again.outputPortId).toBe('new-out');
  });

  it('flags ambiguous equal-score ports and leaves them unbound', () => {
    const twinPorts: MidiPortInfo[] = [
      { id: 'a-in', name: 'Generic MIDI', type: 'input', state: 'connected' },
      { id: 'b-in', name: 'Generic MIDI', type: 'input', state: 'connected' },
      { id: 'a-out', name: 'Generic MIDI', type: 'output', state: 'connected' },
    ];
    const profile = createGenericProfile({
      displayName: 'Generic MIDI',
      portNameHints: ['generic midi'],
    }).profile!;
    const r = restoreCustomProfilePorts(profile, twinPorts);
    expect(r.ambiguous).toBe(true);
    expect(r.inputPortId).toBeNull();
  });

  it('studio role matching skips ambiguous equal top scores', () => {
    const twins: MidiPortInfo[] = [
      { id: 'c1', name: 'Circuit Rhythm A', type: 'input', state: 'connected' },
      { id: 'c2', name: 'Circuit Rhythm B', type: 'input', state: 'connected' },
      { id: 'c1o', name: 'Circuit Rhythm A', type: 'output', state: 'connected' },
    ];
    const role = MY_STUDIO_ROLES.find((r) => r.id === 'circuit')!;
    expect(
      isAmbiguousPortMatch(twins.filter((p) => p.type === 'input'), new Set(), role, [role], role.portNameHints),
    ).toBe(true);
    const matched = matchPortsToRoles(twins);
    // Neither Circuit input wins when both score equally.
    expect(matched.find((a) => a.roleId === 'circuit')?.inputPortId).toBeNull();
  });
});

describe('MIDI Learn on generic controls + cancel semantics', () => {
  it('applies Learn CC to a user-added control (no fake factory map)', () => {
    let p = createGenericProfile({ displayName: 'Pad' }).profile!;
    p = addControl(p, 'Filter').profile!;
    expect(p.controls).toHaveLength(1);
    expect(p.controls[0]!.cc).toBeUndefined();
    p = applyLearnToControl(p, p.controls[0]!.id, 74, 2).profile!;
    expect(p.controls[0]!.cc).toBe(74);
    expect(p.controls[0]!.channel).toBe(2);
    p = removeControl(p, p.controls[0]!.id).profile!;
    expect(p.controls).toHaveLength(0);
  });

  it('Learn glass ignore + mapping key stay stable (cancel path helpers)', () => {
    expect(isLearnGlassIgnoredMidi('clock')).toBe(true);
    expect(isLearnGlassIgnoredMidi('cc')).toBe(false);
    const k = controlMappingKey({ track: 5, kind: 'macro', knob: 2 });
    expect(k).toBe('t5:macro2');
    // Cancel restores baseline elsewhere in runtime; key inequality proves distinct slots.
    expect(controlMappingKey({ track: 5, kind: 'macro', knob: 3 })).not.toBe(k);
  });
});

describe('onboarding + plain clock copy', () => {
  it('walks Connect → Identify → Assign → Play', () => {
    expect(nextOnboardingStep({ midiReady: false, midiError: null, connectedPortCount: 0, circuitAssigned: false, hasUnmatchedPorts: false }).step).toBe('connect');
    expect(nextOnboardingStep({ midiReady: true, midiError: null, connectedPortCount: 0, circuitAssigned: false, hasUnmatchedPorts: false }).step).toBe('connect');
    expect(nextOnboardingStep({ midiReady: true, midiError: null, connectedPortCount: 2, circuitAssigned: false, hasUnmatchedPorts: true }).step).toBe('identify');
    expect(nextOnboardingStep({ midiReady: true, midiError: null, connectedPortCount: 4, circuitAssigned: true, hasUnmatchedPorts: true }).step).toBe('assign');
    expect(nextOnboardingStep({ midiReady: true, midiError: null, connectedPortCount: 4, circuitAssigned: true, hasUnmatchedPorts: false }).step).toBe('play');
  });

  it('plainClockHint avoids receive-* jargon', () => {
    const h = plainClockHint({
      forwarding: true,
      circuitIn: true,
      missingOuts: [],
      mpcUsbClockRisk: false,
      heardClock: false,
      forwardedClock: false,
    });
    expect(h.toLowerCase()).not.toMatch(/receive-none|receive-but/);
    expect(h).toMatch(/Clock Tx/i);
  });

  it('honestyFromCapabilities never invents verified from empty', () => {
    expect(honestyFromCapabilities([])).toBe('generic');
    expect(honestyFromCapabilities([{ id: 'x', label: 'x', status: 'untested' }])).toBe('documented');
    expect(honestyFromCapabilities([{ id: 'x', label: 'x', status: 'verified' }])).toBe('verified');
  });
});

describe('mapping persistence across save/load', () => {
  let store: Storage;
  beforeEach(() => {
    store = memoryStorage();
  });

  it('keeps Learn mapping after save → load', () => {
    let p = createGenericProfile({
      displayName: 'Persist Me',
      inputPortName: 'Persist In',
      outputPortName: 'Persist Out',
    }).profile!;
    p = addControl(p, 'Resonance').profile!;
    p = applyLearnToControl(p, p.controls[0]!.id, 71, 4).profile!;
    saveCustomProfiles([p], store);
    const loaded = loadCustomProfiles(store)[0]!;
    expect(loaded.controls[0]!.cc).toBe(71);
    expect(loaded.controls[0]!.channel).toBe(4);
    expect(loaded.inputPortName).toBe('Persist In');
  });
});
