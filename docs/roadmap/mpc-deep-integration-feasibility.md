# Phase A — Deep MPC integration feasibility

**Status:** docs only · stacked on MPC DIN Setup · **do not merge** until Patryk asks  
**Full assessment:** store `docs/mpc-deep-integration-feasibility.md`  
**Brief:** Deep Akai MPC integration (Network MIDI vs Library)

## Headline

Keep **Network MIDI** (Web MIDI / ports / Learn / opt-in transport) separate from **Library** (optional later local companion, read-only first). DIN/Scarlett clock remains the safe sequencer-follow path; **USB-B clock is useless** for starting the MPC sequencer.

## Architecture sketch

- Network MIDI → existing `HardwareTransport` + studio MPC role + port honesty helpers.
- Library → future optional companion (localhost / path IPC); web never assumes it exists.
- Expansion-builder / unlicensed trees → **REFERENCE only — no copy**.
- No SysEx, no FW flash, no auto developer mode, no clock-default flip.

## Phase order

A Feasibility (this) → B Network MIDI first-class → C Library PoC → D UI → E Backup/WAV→FLIP → F Bench protocol.

## Phase B (Network MIDI) — shipped in stack

- Picker labels: Scarlett DIN · clock OK / USB-B · no clock / Network MIDI / IAC
- Bare IAC & Network Session never auto-assign; Akai Network → MPC only
- Disconnect releases hanging notes; manual assignment remembered
- Clock follow stays opt-in (no default flip). No Library/companion.

## Phase C (Library companion PoC) — shipped in stack

- `@dawlessdaw/mpc-library` + `node scripts/mpc-library-companion.mjs` (127.0.0.1 only)
- Read-only fixtures · origin-checked · no shell · no SSH · no expansion-builder
- Setup → Experimental: honest Offline UI (never fake Connected)
- Separate from Network MIDI

## Phase D (Project browser UI) — shipped in stack

- Sounds → **MPC** panel: Projects / Audio / Expansions (read-only)
- Fixture preview while Offline — never fakes Connected
- Import / Backup buttons disabled stubs → Phase E
- Soft mint · IBM Plex · dark glass

## Related

- `docs/mpc-via-scarlett.md` · `docs/limitations.md` · Setup DIN next-action (PR #79)
