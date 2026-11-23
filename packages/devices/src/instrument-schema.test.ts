import { describe, expect, it } from 'vitest';
import {
  chainImpliesClockForward,
  exampleFm1JamChain,
  INSTRUMENT_SCHEMA_VERSION,
  instrumentFromDeviceProfile,
  instrumentFromGenericProfile,
  instrumentFromStudioRole,
  instrumentHasAudio,
  instrumentHasMidi,
  makeInstrumentBundle,
  parseInstrument,
  parseInstrumentBundle,
  projectBuiltinInstruments,
  projectStudioRoleInstruments,
} from './instrument-schema';
import { DEVICE_PROFILES } from './profiles';
import { MY_STUDIO_ROLES } from './studio-layout';
import type { GenericDeviceProfile } from './generic-profile';
import { DEVICE_PROFILE_SCHEMA_VERSION } from './generic-profile';

describe('Instrument schema (step 13)', () => {
  it('projects builtin DEVICE_PROFILES without renaming ids', () => {
    const list = projectBuiltinInstruments();
    expect(list.length).toBe(Object.keys(DEVICE_PROFILES).length);
    const mpc = list.find((i) => i.provenance?.deviceProfileKey === 'mpc-one');
    expect(mpc?.id).toBe('builtin:mpc-one');
    expect(mpc?.honesty).toBe('builtin');
    expect(instrumentHasMidi(mpc!)).toBe(true);
    expect(mpc?.midi.ports.some((p) => p.role === 'in')).toBe(true);
    expect(mpc?.midi.ports.some((p) => p.role === 'out')).toBe(true);
  });

  it('projects studio roles including audio-only ZED', () => {
    const roles = projectStudioRoleInstruments();
    expect(roles.map((r) => r.provenance?.studioRoleId)).toEqual(
      MY_STUDIO_ROLES.map((r) => r.id),
    );
    const zed = roles.find((r) => r.provenance?.studioRoleId === 'zed')!;
    expect(instrumentHasMidi(zed)).toBe(false);
    expect(instrumentHasAudio(zed)).toBe(true);
    expect(zed.audio.ports.some((p) => p.role === 'bus')).toBe(true);
  });

  it('adapts GenericDeviceProfile without touching storage keys', () => {
    const profile: GenericDeviceProfile = {
      schemaVersion: DEVICE_PROFILE_SCHEMA_VERSION,
      id: 'my-synth',
      displayName: 'My Synth',
      manufacturer: 'Test',
      category: 'synth',
      colour: '#8bb0a1',
      channel: 3,
      inputPortName: 'My Synth MIDI',
      outputPortName: 'My Synth MIDI',
      portNameHints: ['my synth'],
      honesty: 'generic',
      capabilities: [{ id: 'midi-io', label: 'MIDI', status: 'untested' }],
      controls: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const inst = instrumentFromGenericProfile(profile);
    expect(inst.id).toBe('generic:my-synth');
    expect(inst.midi.channel).toBe(3);
    expect(inst.provenance?.genericProfileId).toBe('my-synth');
    expect(inst.audio.enabled).toBe(false);
  });

  it('round-trips a valid instrument through parseInstrument', () => {
    const src = instrumentFromDeviceProfile('circuit-rhythm', DEVICE_PROFILES['circuit-rhythm']!);
    const parsed = parseInstrument(JSON.parse(JSON.stringify(src)));
    expect(parsed.ok).toBe(true);
    expect(parsed.instrument?.schemaVersion).toBe(INSTRUMENT_SCHEMA_VERSION);
    expect(parsed.instrument?.id).toBe(src.id);
  });

  it('rejects bad schema versions and honesty', () => {
    expect(parseInstrument({ schemaVersion: 99, id: 'x', displayName: 'X' }).ok).toBe(false);
    const bad = parseInstrument({
      schemaVersion: 1,
      id: 'x',
      displayName: 'X',
      kind: 'synth',
      honesty: 'magic',
      midi: { enabled: true, ports: [] },
      audio: { enabled: false, ports: [] },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => /honesty/.test(e))).toBe(true);
  });

  it('bundle parse keeps chain → instrument refs; never implies clock forward', () => {
    const circuit = instrumentFromStudioRole(MY_STUDIO_ROLES.find((r) => r.id === 'circuit')!);
    const fm1 = instrumentFromStudioRole(MY_STUDIO_ROLES.find((r) => r.id === 'fm1')!);
    const chain = exampleFm1JamChain({ circuitId: circuit.id, fm1Id: fm1.id });
    expect(chainImpliesClockForward(chain)).toBe(false);

    const bundle = makeInstrumentBundle([circuit, fm1], [chain]);
    const parsed = parseInstrumentBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    expect(parsed.bundle?.chains[0]?.stages).toHaveLength(2);
    expect(parsed.bundle?.kind).toBe('splot-instruments');
  });

  it('rejects chains that point at missing instruments', () => {
    const circuit = instrumentFromStudioRole(MY_STUDIO_ROLES.find((r) => r.id === 'circuit')!);
    const bundle = makeInstrumentBundle([circuit], [
      {
        schemaVersion: 1,
        id: 'chain:bad',
        name: 'Bad',
        stages: [
          { id: 's1', role: 'source', instrumentId: circuit.id },
          { id: 's2', role: 'destination', instrumentId: 'role:missing' },
        ],
      },
    ]);
    const parsed = parseInstrumentBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(false);
  });
});
