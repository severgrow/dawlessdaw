# Dawlessdaw v0.1 — Limitations & Hardware Honesty

Capability statuses used throughout the app: **verified** | **untested** | **experimental** | **unavailable** | **unknown**.

## Transport

| Transport | Status | Notes |
|-----------|--------|-------|
| WebMidiTransport | verified (browser API) | Chrome / Edge on macOS; requires user gesture + HTTPS or localhost. Timing Clock / Start / Stop are delivered, but on the **main thread** with jitter — not a sample-accurate clock master. |
| Circuit tempo follow (display) | experimental | Shows ≈BPM from Circuit-in F8 on Transport / Play / Jam. **Not** a clock master; does **not** enable app clock forwarding by default. SP/others follow via thru/DIN hardware. See [circuit-tempo-follow.md](./circuit-tempo-follow.md). |
| Dawlessdaw 8×16 sequencer | experimental (browser) | Follows Circuit clock by default; optional internal BPM. Uses Web MIDI output timestamps + main-thread look-ahead — **not** sample-accurate. Does **not** display Circuit internal patterns (Circuit Pattern Unavailable). See [sequencer.md](./sequencer.md). |
| Circuit Mirror (Live) | experimental | Passive observation of Circuit **input** notes + clock; loop-aware 8×16 grid. Does **not** change outbound routing. Not a dump of unsaved Circuit pattern RAM. Hardware **untested** until Patryk confirms. See [circuit-mirror.md](./circuit-mirror.md). |
| Circuit Mirror (Saved .ncs) | experimental | Local file parse via Deep Sync `.ncs` layout. Prefer SD card reader. Never auto USB file-protocol (that stops device playback); USB path only after Deep Sync confirm. |
| Circuit Phase 2 (checklist / ticks / 64 projects / section cards) | experimental | Passive observe + local metadata. Soft takeover off by default (shared with Super Macros). Mute = inferred until bench Pass. Arrhythmia = design-only — see [arrhythmia-module.md](./arrhythmia-module.md). |
| FLIP capture lane | experimental (browser) | Hardware stereo loop under the 8 MIDI tracks via Session Recorder AudioWorklet. Quantised start vs sequencer clock is **not** sample-accurate; unaligned takes are labelled; **no** silent time-stretch. Circuit audio unused. Live Scarlett/ZED capture **unverified**. See [flip.md](./flip.md). |
| MockMidiTransport | verified | Deterministic fixtures for simulation / tests |
| NativeBridgeTransport | unavailable | Stub only — no native MIDI bridge in v0.1 |
| MPC Library companion | experimental (PoC) | Optional loopback helper (`@dawlessdaw/mpc-library` / `npm run mpc-library`). Fixtures only; Offline until `/health` ok. No SSH, no shell, no expansion-builder. Separate from Network MIDI. |

## USB app clock → MPC One (sequencer follow)

Akai documents that the MPC **USB-B port does not support receiving MIDI Clock from a DAW**. App clock sent to the MPC's USB port can show **OUT ticks** while the MPC stays silent — note/sample triggers alone do not start the sequencer. This studio reaches the MPC through a **USB-MIDI interface into its DIN In** (Scarlett 2i4): Setup **MPC follows Circuit Play** forwards Clock + Start/Stop/Continue (+ SPP if Circuit sends it). See [mpc-via-scarlett.md](./mpc-via-scarlett.md). **Hardware untested** until bench **g3** is Pass.

## Device adapters

| Device | MIDI I/O | Remote control | Notes |
|--------|----------|----------------|-------|
| Akai MPC One (MPC 3 standalone) | untested | unavailable | Generic MIDI port discovery; no MPC 3 sysex/remote control claimed |
| Roland SP-404MKII (stock) | untested | unavailable | Port identity + basic MIDI notes/CC; no pad/pattern remote. Phase 3: Sounds → SP-404 checklist / ticks / effect-by-ear (untested until confirm); SD pad names + playing-pad lights; Mode A bank PC in sections (unverified). Samples tab can **read** exported project pads from a mounted SD; Sessions stage WAVs into `IMPORT/` — on-device SHIFT+Import still required. **SP USB (experimental)** Web Serial (`?spUsb=1`) is **read-only** CDC for FW **5.51**; **5.52** needs explicit OK — see [sp404-usb-protocol.md](./sp404-usb-protocol.md) / [sp404-phase-3.md](./sp404-phase-3.md); not a pad push |
| Roland SP-404MKII (DOOM OS) | experimental | unknown | Profile flag only; Phase 3 shows a DOOM note — DOOM-specific features not verified |
| Novation Circuit Rhythm | untested | experimental | Official map encoded (tracks/CC/Project PGM); Mixer Level **CC29** / Pan **CC30** per track ch (PRG v5) → My Studio remaps to dest **CC7/CC10**; Scene MIDI **unavailable** in PRG; live Mixer TX + dest response hardware-testing-required. **Internal pattern dump over stock MIDI: unsupported** — see [circuit-deep-sync.md](./circuit-deep-sync.md) (saved `.ncs` / Components-style file protocol only; Bench → Circuit Deep Sync) |
| M-VAVE FM1 (**H-1** on this studio) | unknown | unavailable (deep map) | Community H-1 ([jakehandy/h1](https://github.com/jakehandy/h1)): treat as generic MIDI until Bench Pass. Docs claim notes + CC 20–23 but **unknown/untested** here. **Not** FM1 Open. Do not assume Open/stock CC maps. |
| Allen & Heath ZED-10FX | unavailable (MIDI) | unavailable | USB stereo audio only — **no** fake MIDI or digital mixer control. Session Recorder can capture ZED/Scarlett/any input locally; hardware record **unverified** until Bench **m.** Pass. |

## Features deliberately absent

- No invented firmware remote control for unverified sysex / proprietary protocols
- No claim of live Circuit pattern sync from stock USB MIDI (saved project files ≠ unsaved sequencer RAM)
- No fake Circuit mute / stem isolation from a stereo mix (FLIP Phase C — design only)
- No fake Circuit **Scene** sync (Project PGM observe ≠ Scene MIDI)
- No MPC Plugin SDK “companion” that exports global MPC state (plugins cannot send MIDI to host)
- No dependency on DOOM OS / Arrhythmia / MidiHax firmware
- No assumption that H-1, stock, and FM1 Open share CC maps
- No AI runtime dependency (AssistantTool is an extension point only)
- IndexedDB storage only (SQLite planned later)
- Real-hardware integration tests: **pending** (marked in test suite)

## Research index

See `docs/hardware-integration/` for the Nov 2026 feasibility pass (matrix, inventory, Circuit arranger, connection plan, priorities).

## Simulation mode

When simulation is on, all I/O goes through `MockMidiTransport` and fixture replay. The UI labels this clearly so it cannot be mistaken for live hardware.
