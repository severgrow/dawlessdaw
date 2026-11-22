import type {
  DeviceCapability,
  DeviceId,
  DeviceKind,
  DeviceProfile,
  MidiMessage,
  PortId,
  StudioDevice,
} from '@dawlessdaw/core';
import type { DeviceProfile as DP } from '@dawlessdaw/core';
import { CircuitRhythmInterpreter, trackFromChannel } from './circuit-rhythm';

export interface DeviceAdapter {
  readonly kind: DeviceKind;
  readonly profile: DeviceProfile;
  createDevice(id: DeviceId, ports: { inputs: PortId[]; outputs: PortId[] }): StudioDevice;
  /** Optional message interpretation for UI / roles. */
  interpret?(message: MidiMessage): Record<string, unknown> | null;
  matchPortName(name: string): boolean;
}

function matchHints(name: string, hints: string[]): boolean {
  const n = name.toLowerCase();
  return hints.some((h) => n.includes(h.toLowerCase()));
}

export abstract class BaseAdapter implements DeviceAdapter {
  abstract readonly kind: DeviceKind;
  abstract readonly profile: DP;

  matchPortName(name: string): boolean {
    return matchHints(name, this.profile.portNameHints);
  }

  createDevice(id: DeviceId, ports: { inputs: PortId[]; outputs: PortId[] }): StudioDevice {
    return {
      id,
      kind: this.kind,
      displayName: this.profile.displayName,
      inputPortIds: ports.inputs,
      outputPortIds: ports.outputs,
      connected: ports.inputs.length + ports.outputs.length > 0,
      firmwareProfile: this.profile.defaultFirmwareProfile,
      capabilities: this.profile.capabilities.map((c) => ({ ...c })),
      midiEnabled: this.profile.hasMidi,
    };
  }
}

export class MpcOneAdapter extends BaseAdapter {
  readonly kind = 'mpc-one' as const;
  constructor(public readonly profile: DP) {
    super();
  }
}

export class Sp404Adapter extends BaseAdapter {
  readonly kind = 'sp404mkii' as const;
  constructor(public readonly profile: DP) {
    super();
  }

  setFirmwareProfile(device: StudioDevice, profile: 'stock' | 'doom'): StudioDevice {
    const caps: DeviceCapability[] =
      profile === 'doom'
        ? [
            { id: 'midi-notes-cc', label: 'MIDI notes / CC', status: 'experimental' },
            {
              id: 'doom-features',
              label: 'DOOM OS-specific features',
              status: 'unknown',
              notes: 'Profile flag only',
            },
          ]
        : [
            { id: 'midi-notes-cc', label: 'MIDI notes / CC', status: 'untested' },
            {
              id: 'pad-remote',
              label: 'Pad / pattern remote',
              status: 'unavailable',
            },
          ];
    return {
      ...device,
      firmwareProfile: profile,
      displayName:
        profile === 'doom' ? 'Roland SP-404MKII (DOOM OS)' : 'Roland SP-404MKII (stock)',
      capabilities: caps,
    };
  }
}

export class CircuitRhythmAdapter extends BaseAdapter {
  readonly kind = 'circuit-rhythm' as const;
  private interpreter = new CircuitRhythmInterpreter();

  constructor(public readonly profile: DP) {
    super();
  }

  /** Default track↔channel map from Novation User Guide (Confirmed). */
  trackFromChannel(channel: number): number | null {
    return trackFromChannel(channel);
  }

  interpret(message: MidiMessage): Record<string, unknown> | null {
    const out = this.interpreter.interpret(message);
    return {
      ...out,
      adapter: 'circuit-rhythm',
      firmwareNote: 'Stock Circuit Rhythm map — not Circuit Tracks',
    };
  }
}

export type Fm1FirmwareProfile = 'h-1' | 'stock' | 'open' | 'generic';

export class MVaveFm1Adapter extends BaseAdapter {
  readonly kind = 'm-vave-fm1' as const;
  constructor(public readonly profile: DP) {
    super();
  }

  /** Legacy alias — prefer setFirmwareProfile. */
  setFirmwareMode(
    device: StudioDevice,
    mode: 'generic' | 'firmware-aware' | Fm1FirmwareProfile,
  ): StudioDevice {
    const mapped: Fm1FirmwareProfile =
      mode === 'firmware-aware' ? 'open' : mode === 'generic' ? 'generic' : mode;
    return this.setFirmwareProfile(device, mapped);
  }

  setFirmwareProfile(device: StudioDevice, profile: Fm1FirmwareProfile): StudioDevice {
    const labels: Record<Fm1FirmwareProfile, string> = {
      'h-1': 'M-VAVE FM1 (H-1)',
      stock: 'M-VAVE FM1 (stock)',
      open: 'M-VAVE FM1 (Open)',
      generic: 'M-VAVE FM1',
    };
    const caps: DeviceCapability[] =
      profile === 'h-1'
        ? [
            {
              id: 'generic-midi',
              label: 'Generic MIDI notes (any channel)',
              status: 'untested',
              notes: 'H-1 docs: notes + velocity; live bench required',
            },
            {
              id: 'h1-knob-cc',
              label: 'H-1 knob CC 20–23',
              status: 'untested',
              notes: 'Documented by jakehandy/h1; CC 123 all-notes-off; no fuller map claimed',
            },
            {
              id: 'firmware-map',
              label: 'Deep firmware CC / SysEx map',
              status: 'unavailable',
              notes: 'Do not apply Open/stock CC tables to H-1',
            },
          ]
        : profile === 'open'
          ? [
              {
                id: 'generic-midi',
                label: 'Generic MIDI',
                status: 'untested',
              },
              {
                id: 'firmware-map',
                label: 'Open V14+ per-track CC map',
                status: 'experimental',
                notes: 'Use only when unit actually runs FM1 Open — not this studio’s H-1',
              },
            ]
          : [
              {
                id: 'generic-midi',
                label: 'Generic MIDI',
                status: 'untested',
              },
              {
                id: 'firmware-map',
                label: 'Firmware-aware feature map',
                status: 'unavailable',
                notes:
                  profile === 'stock'
                    ? 'Stock MIDI CONTROL PDF exists; exact CC table not encoded here'
                    : 'No firmware profile assumed',
              },
            ];
    return {
      ...device,
      firmwareProfile: profile,
      displayName: labels[profile],
      capabilities: caps,
    };
  }
}

/**
 * ZED-10FX: USB audio capture only. No MIDI adapter behaviour.
 */
export class Zed10fxAdapter extends BaseAdapter {
  readonly kind = 'zed-10fx' as const;
  constructor(public readonly profile: DP) {
    super();
  }

  override createDevice(id: DeviceId, ports: { inputs: PortId[]; outputs: PortId[] }): StudioDevice {
    const device = super.createDevice(id, { inputs: [], outputs: [] });
    return {
      ...device,
      midiEnabled: false,
      connected: true, // registered as studio member even without MIDI ports
      inputPortIds: ports.inputs,
      outputPortIds: ports.outputs,
    };
  }

  override matchPortName(_name: string): boolean {
    // ZED does not appear as MIDI — matched only via manual registration
    return false;
  }
}
