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
      {
        id: 'din-notes-via-interface',
        label: 'Notes in on the MIDI (DIN) In from a USB MIDI interface (e.g. Scarlett 2i4)',
        status: 'untested',
        notes: 'Circuit T1–T4 → app → MPC ch9–12 through the assigned MPC Out port. Bench g2.',
      },
      {
        id: 'din-clock-via-interface',
        label: 'Follows MIDI Clock / Start / Stop on the MIDI (DIN) In',
        status: 'untested',
        notes:
          'DIN In accepts clock (the Akai USB-B clock limit is USB only). App forwards Circuit clock when "Circuit clock → MPC" is on. Bench g3.',
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
    displayName: 'M-VAVE FM1 (Skiff)',
    manufacturer: 'M-VAVE',
    portNameHints: [
      'fm1',
      'fm-1',
      'skiff',
      'felucca',
      'h-1',
      'h1',
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
    // User studio now runs Skiff (illuminus5/skiff, built on Felucca); h1 kept as an option.
    // Chrome may show the USB port as "Felucca". Everything untested until Bench Pass.
    firmwareProfiles: ['skiff', 'h-1', 'stock', 'open', 'generic'],
    defaultFirmwareProfile: 'skiff',
    capabilities: [
      {
        id: 'skiff-track-channels',
        label: 'Skiff: 6 tracks, each on its own MIDI channel (T1–T6 CHANNEL, since 1.3)',
        status: 'untested',
        notes:
          'Skiff README. Plan: set Skiff T1–T4 to ch5–8 so Circuit T5–T8 play them unchanged.',
      },
      {
        id: 'skiff-standard-cc',
        label: 'Skiff standard CCs (7 level, 10 pan, 74 brightness, 71 res, 73/75/72 env, 91/93/94 sends)',
        status: 'untested',
        notes: 'Skiff README. Circuit macros 21–27 are translated to these by My Studio routes.',
      },
      {
        id: 'skiff-program-change',
        label: 'Skiff Program Change loads the track\'s nth sound of its engine (since 1.3)',
        status: 'untested',
        notes:
          'Skiff README. Circuit macro 8 (CC28) is split into 8 zones; each zone sends one Program Change on the track channel (ch5–8). PC number base and behaviour past the engine\'s last sound are undocumented — confirm with bench test h4.',
      },
      {
        id: 'skiff-usb-clock',
        label: 'Skiff CLOCK source INT / USB / TRS',
        status: 'untested',
        notes: 'Skiff README. App can forward Circuit clock to FM1 over USB (Settings toggle).',
      },
      {
        id: 'h1-any-channel',
        label: 'h1 (alternative firmware): plays notes on any channel; knobs CC 20–23',
        status: 'unknown',
        notes:
          'jakehandy/h1 guide. Never put an h1 FM1 on the thru-box chain — it would play every track.',
      },
      {
        id: 'firmware-map',
        label: 'Deep firmware SysEx map',
        status: 'unavailable',
        notes: 'Skiff ≠ h1 ≠ Open ≠ stock. Never apply one firmware’s map to another.',
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
