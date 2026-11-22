import type { CapabilityRow } from './types';

/**
 * Capability matrix for Circuit Rhythm deep pattern access.
 * Tiers: proven | documented-unverified | theoretical | unsupported
 */
export const CIRCUIT_DEEP_SYNC_CAPABILITIES: readonly CapabilityRow[] = [
  {
    id: 'perf-notes-tx',
    title: 'Performance Note On/Off on track channels 1–8',
    lane: 'stock-performance-midi',
    tier: 'documented-unverified',
    notes:
      'PRG v5 + User Guide MIDI appendix. Dawlessdaw Bench a/b observe live notes; not stored pattern dumps.',
    safety: 'safe-readonly',
  },
  {
    id: 'perf-clock-tx',
    title: 'MIDI Clock / Start / Stop / Continue / SPP',
    lane: 'stock-performance-midi',
    tier: 'documented-unverified',
    notes: 'PRG realtime + system common tables. Transport events ≠ pattern contents.',
    safety: 'safe-readonly',
  },
  {
    id: 'perf-project-pgm',
    title: 'Project select Program Change on channel 16',
    lane: 'stock-performance-midi',
    tier: 'documented-unverified',
    notes: 'PRG: 0–63 instant, 64–127 queued. FW 2.0.1 Tx documented in Novation sync KB.',
    safety: 'safe-readonly',
  },
  {
    id: 'perf-cc-nrpn',
    title: 'Per-track CC / NRPN (macros, mixer, FX)',
    lane: 'stock-performance-midi',
    tier: 'documented-unverified',
    notes: 'PRG tables. Live knob TX needs CC Tx ON; automation lane dump is not provided.',
    safety: 'safe-readonly',
  },
  {
    id: 'identity-request',
    title: 'Universal SysEx Identity Request / Reply',
    lane: 'stock-performance-midi',
    tier: 'proven',
    notes:
      'MIDI 1.0 standard. Remix Device.identify expects Novation 00 20 29 / family 1 / model 0x63 for Rhythm.',
    safety: 'safe-readonly',
  },
  {
    id: 'stock-file-protocol-read',
    title: 'Components-style USB file protocol — read saved Sessions/*.ncs',
    lane: 'stock-file-protocol',
    tier: 'proven',
    notes:
      'Reverse-engineered in CIRCUIT-REMIX Device (rm_app.html). Reads storage files, not live sequencer RAM. Opening a session stops transport / locks panel (Remix UI copy).',
    safety: 'state-changing-confirm',
  },
  {
    id: 'saved-ncs-pattern-layout',
    title: 'Saved .ncs pattern layout (8×8 patterns, 32 steps, 12 lanes)',
    lane: 'saved-project-file',
    tier: 'proven',
    notes:
      'Remix SD/Session parser: SESS_SIZE 0x29484, PAT0 0x2E4, PAT 0xA28, 32×8-byte steps, settings +0x100, 12×192-byte lanes +0x128. Emulation + tooling; hardware file IO via Remix app.',
    safety: 'safe-readonly',
  },
  {
    id: 'live-pattern-ram-dump',
    title: 'Live internal sequencer / unsaved pattern RAM dump over stock MIDI',
    lane: 'stock-performance-midi',
    tier: 'unsupported',
    notes:
      'Not in PRG v5 (zero SysEx). Remix snapshot explicitly excludes unsaved project edits. Do not assume live sync from saved-pattern display.',
    safety: 'forbidden',
  },
  {
    id: 'scene-midi',
    title: 'Dedicated Scene-change MIDI message',
    lane: 'stock-performance-midi',
    tier: 'unsupported',
    notes: 'Not in PRG. Existing Dawlessdaw Bench c captures any traffic; Scene sync remains unavailable.',
    safety: 'safe-readonly',
  },
  {
    id: 'custom-fw-marker',
    title: 'Custom firmware marker query (Remix/Hacks 0x7D 43 54)',
    lane: 'custom-firmware-protocol',
    tier: 'proven',
    notes: 'Remix fwQuery; null/timeout on official stock. Read-only probe — not a pattern dump.',
    safety: 'safe-readonly',
  },
  {
    id: 'custom-fw-live-pattern-notify',
    title: 'Live track/pattern/step notifications (custom FW)',
    lane: 'custom-firmware-protocol',
    tier: 'theoretical',
    notes:
      'Design-only proposal for a future read-only Remix/Rhythm Plus patch. Not implemented; do not flash.',
    safety: 'forbidden',
  },
  {
    id: 'firmware-update',
    title: 'Firmware update / storage writes / project overwrite',
    lane: 'stock-file-protocol',
    tier: 'unsupported',
    notes: 'Explicitly out of scope for Circuit Deep Sync bench. Forbidden.',
    safety: 'forbidden',
  },
];
