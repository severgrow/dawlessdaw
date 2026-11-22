# G — Development priorities (next three phases)

## Phase 1 — Circuit Rhythm arranger awareness (this pass)

**Smallest useful PoC**

- Encode official Circuit MIDI map (tracks, macros, Project PGM).
- Classify inbound messages (background / sequencer / gesture / arrangement).
- Optional Project PGM → NervOS Studio Scene map.
- Generate documented direct-sequencing routes.
- Simulated fixtures + unit tests (not hardware proof).

## Phase 2 — Live hardware bench + SP EFX panel

- Live mode: re-bind routes to real port IDs after Web MIDI enumerate.
- Confirm mute/Note Tx, Scene observability, USB vs DIN on Circuit.
- SP-404MKII stock EFX CC panel + pad note map.
- MPC MIDI Learn mute pack (exported mapping sheet + test CCs).

## Phase 3 — Firmware-aware FM1 + optional librarians

- Prefer **FM1 Open V14+** for deep CC panel (document stock vs Open divergence).
- Offline Circuit pack builder (original code; SD layout from Novation docs).
- Optional open404/Sparky **read-only** backup sidecar (native), never in core router.
- Revisit MPC Plugin SDK only for on-device FX/instruments — **not** as NervOS IPC.

## Non-goals for these phases

- Flashing DOOM OS / Arrhythmia / MidiHax as a NervOS requirement.
- Claiming remote MPC arrangement without bench proof.
- ZED digital control.
- AI in the MIDI path.
