import type { DeviceProfile } from '@dawlessdaw/core';

export const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  'mpc-one': {
    kind: 'mpc-one',
    displayName: 'Akai MPC One',
    manufacturer: 'Akai',
    portNameHints: ['mpc one', 'mpc-one', 'akai mpc'],
    hasMidi: true,
    hasAudioCapture: false,
    capabilities: [
      {
        id: 'midi-io',
        label: 'MIDI I/O via Web MIDI',
        status: 'untested',
        notes: 'Port discovery expected; MPC 3 standalone remote control not claimed',
      },
      {
        id: 'mpc3-remote',
        label: 'MPC 3 remote / sysex control',
        status: 'unavailable',
        notes: 'No verified protocol support in v0.1',
      },
      {
        id: 'clock',
        label: 'MIDI clock send/receive',
        status: 'untested',
      },
    ],
  },
  'sp404mkii-stock': {
    kind: 'sp404mkii',
    displayName: 'Roland SP-404MKII (stock)',
    manufacturer: 'Roland',
    portNameHints: ['sp-404', 'sp404', '404mkii', '404 mkii'],
    hasMidi: true,
    hasAudioCapture: false,
    firmwareProfiles: ['stock', 'doom'],
    defaultFirmwareProfile: 'stock',
    capabilities: [
      {
        id: 'midi-notes-cc',
        label: 'MIDI notes / CC',
        status: 'untested',
      },
      {
        id: 'pad-remote',
        label: 'Pad / pattern remote',
        status: 'unavailable',
        notes: 'Not inventing stock firmware remote control',
      },
    ],
  },
  'sp404mkii-doom': {
    kind: 'sp404mkii',
    displayName: 'Roland SP-404MKII (DOOM OS)',
    manufacturer: 'Roland',
    portNameHints: ['sp-404', 'sp404', '404mkii'],
    hasMidi: true,
    hasAudioCapture: false,
    firmwareProfiles: ['stock', 'doom'],
    defaultFirmwareProfile: 'doom',
    capabilities: [
      {
        id: 'midi-notes-cc',
        label: 'MIDI notes / CC',
        status: 'experimental',
      },
      {
        id: 'doom-features',
        label: 'DOOM OS-specific features',
        status: 'unknown',
        notes: 'Profile flag only — features not verified',
      },
    ],
  },
  'circuit-rhythm': {
    kind: 'circuit-rhythm',
    displayName: 'Novation Circuit Rhythm',
    manufacturer: 'Novation',
    portNameHints: ['circuit rhythm', 'circuit-rhythm', 'novation circuit'],
    hasMidi: true,
    hasAudioCapture: false,
    capabilities: [
      {
        id: 'midi-tracks',
        label: 'Per-track MIDI channels 1–8 (default)',
        status: 'untested',
        notes: 'Confirmed in Novation User Guide; live TX still hardware-testing-required',
      },
      {
        id: 'project-pgm',
        label: 'Project select via Program Change ch16',
        status: 'untested',
        notes: 'Confirmed in Programmer’s Reference + sync KB (Tx from FW 2.0.1)',
      },
      {
        id: 'scene-sync',
        label: 'Hardware Scene Sync / Scene MIDI',
        status: 'unavailable',
        notes: 'No Scene MIDI message in PRG — do not fake; Project PGM ≠ Scene',
      },
      {
        id: 'arranger-direct',
        label: 'Direct-sequencing arranger adapter',
        status: 'experimental',
        notes: 'Dawlessdaw routes track channels → external devices (sim verified)',
      },
    ],
  },
  'm-vave-fm1': {
    kind: 'm-vave-fm1',
    displayName: 'M-VAVE FM1',
    manufacturer: 'M-VAVE',
    portNameHints: ['fm1', 'm-vave', 'mvave'],
    hasMidi: true,
    hasAudioCapture: false,
    firmwareProfiles: ['generic', 'firmware-aware'],
    defaultFirmwareProfile: 'generic',
    capabilities: [
      {
        id: 'generic-midi',
        label: 'Generic MIDI',
        status: 'untested',
      },
      {
        id: 'firmware-map',
        label: 'Firmware-aware feature map',
        status: 'experimental',
        notes: 'Adapter shell present; feature map incomplete',
      },
    ],
  },
  'zed-10fx': {
    kind: 'zed-10fx',
    displayName: 'Allen & Heath ZED-10FX',
    manufacturer: 'Allen & Heath',
    portNameHints: ['zed-10', 'zed10', 'zed 10'],
    hasMidi: false,
    hasAudioCapture: true,
    capabilities: [
      {
        id: 'usb-audio',
        label: 'USB audio capture',
        status: 'untested',
        notes: 'Audio-only — no MIDI / digital mixer control',
      },
      {
        id: 'midi-control',
        label: 'MIDI / mixer remote',
        status: 'unavailable',
        notes: 'Explicitly not faked',
      },
    ],
  },
};

export function listProfiles(): DeviceProfile[] {
  return Object.values(DEVICE_PROFILES);
}
