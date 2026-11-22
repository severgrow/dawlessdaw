import type { DeviceProfile } from '@dawlessdaw/core';

export const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  'mpc-one': {
    kind: 'mpc-one',
    displayName: 'Akai MPC One',
    manufacturer: 'Akai',
    portNameHints: [
      'mpc one',
      'mpc-one',
      'akai professional mpc',
      'akai mpc',
      'akai professional',
      'mpc',
    ],
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
    displayName: 'M-VAVE FM1 (H-1)',
    manufacturer: 'M-VAVE',
    portNameHints: [
      'fm1',
      'fm-1',
      'felucca',
      'h-1',
      'm-vave',
      'm vave',
      'mvave',
      'mvav',
      'ch345',
      'wch.cn',
      'wch',
    ],
    hasMidi: true,
    hasAudioCapture: false,
    // User studio runs community H-1 (jakehandy/h1), not FM1 Open / stock.
    // Chrome may show the CDC port as "Felucca" instead of FM1 / M-VAVE.
    // Until Bench Pass: treat as generic MIDI only — every H-1 capability unknown/untested.
    firmwareProfiles: ['h-1', 'stock', 'open', 'generic'],
    defaultFirmwareProfile: 'h-1',
    capabilities: [
      {
        id: 'generic-midi',
        label: 'Generic MIDI (H-1 — unknown until bench)',
        status: 'unknown',
        notes:
          'This studio’s FM1 runs H-1. Treat as generic MIDI until Bench Pass. Do not assume Open or stock CC maps.',
      },
      {
        id: 'h1-knob-cc',
        label: 'H-1 knob CCs (community docs claim 20–23)',
        status: 'unknown',
        notes:
          'jakehandy/h1 docs only — untested here; not encoded as a working map; CC 123 all-notes-off also untested',
      },
      {
        id: 'firmware-map',
        label: 'Deep firmware CC / SysEx map',
        status: 'unavailable',
        notes:
          'H-1 ≠ Open ≠ stock. Never apply Open V14 or stock MIDI CONTROL tables to H-1.',
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
