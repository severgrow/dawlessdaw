# Dawlessdaw v0.1 — Limitations & Hardware Honesty

Capability statuses used throughout the app: **verified** | **untested** | **experimental** | **unavailable** | **unknown**.

## Transport

| Transport | Status | Notes |
|-----------|--------|-------|
| WebMidiTransport | verified (browser API) | Chrome / Edge on macOS; requires user gesture + HTTPS or localhost |
| MockMidiTransport | verified | Deterministic fixtures for simulation / tests |
| NativeBridgeTransport | unavailable | Stub only — no native MIDI bridge in v0.1 |

## Device adapters

| Device | MIDI I/O | Remote control | Notes |
|--------|----------|----------------|-------|
| Akai MPC One (MPC 3 standalone) | untested | unavailable | Generic MIDI port discovery; no MPC 3 sysex/remote control claimed |
| Roland SP-404MKII (stock) | untested | unavailable | Port identity + basic MIDI notes/CC; no pad/pattern remote |
| Roland SP-404MKII (DOOM OS) | experimental | unknown | Profile flag only; DOOM-specific features not verified |
| Novation Circuit Rhythm | untested | experimental | Official map encoded (tracks/CC/Project PGM); Scene MIDI **unavailable** in PRG; live TX hardware-testing-required |
| M-VAVE FM1 | untested | experimental | Prefer **FM1 Open V14+** for documented CCs; stock map separate; do not require unofficial processors |
| Allen & Heath ZED-10FX | unavailable (MIDI) | unavailable | USB stereo audio only — **no** fake MIDI or digital mixer control |

## Features deliberately absent

- No invented firmware remote control for unverified sysex / proprietary protocols
- No fake Circuit **Scene** sync (Project PGM observe ≠ Scene MIDI)
- No MPC Plugin SDK “companion” that exports global MPC state (plugins cannot send MIDI to host)
- No dependency on DOOM OS / Arrhythmia / MidiHax firmware
- No AI runtime dependency (AssistantTool is an extension point only)
- IndexedDB storage only (SQLite planned later)
- Real-hardware integration tests: **pending** (marked in test suite)

## Research index

See `docs/hardware-integration/` for the Nov 2026 feasibility pass (matrix, inventory, Circuit arranger, connection plan, priorities).

## Simulation mode

When simulation is on, all I/O goes through `MockMidiTransport` and fixture replay. The UI labels this clearly so it cannot be mistaken for live hardware.
