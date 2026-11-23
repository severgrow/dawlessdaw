# Circuit Intelligence (Milestone 1)

**Honesty:** **experimental** until Patryk confirms on hardware. Passive only — Circuit USB **input** MIDI. Never changes outbound routing. Never auto-mutes hardware.

Research: *Making MIDI Modern* A1–A3 (selected-track detector, mute/pattern inference, section clock). Brief: five-features Milestone 1.

## What it does

| Piece | Behaviour |
|-------|-----------|
| **Last-touched track** | Macro CC **21–28** on channels 1–8 → selected track. Confidence High → Low as time passes. |
| **Auto-focus** | Optional (default on). When on, Live controller follows last-touched. Toggle on the panel; saved as `dawlessdaw.circuitIntel.autoFocus`. |
| **Track activity** | After ~2 loops, labels: **Active / Silent / Possible mute / Possible pattern change / Unknown**. Guesses only — confirm on Circuit. |
| **Musical position** | Start/Stop/Continue/Clock → bar/beat (4/4), BPM estimate, Project Change (PC ch16) informational. |
| **Musical events** | Bounded log foundation for later milestones (Timing Lab, Performance Memory, FLIP). |

Circuit Live / Saved / Splot Pattern modes stay separate. Intelligence extends **Circuit Live** UI (grid labels + panel).

## Engine

`CircuitIntelligenceEngine` in `@dawlessdaw/sequencer` (with `MusicalPositionModel`, `MusicalEventLog`).

- Wired from `StudioRuntime` only when the message is from Circuit **in**.
- Analysis runs **after** routing / Mirror note handling — not between note-in and note-out.
- Stable `getSnapshot()` for `useSyncExternalStore`.
- Diagnostic: **Export intelligence JSON** on the panel.

## Repo audit (PR)

| Area | Status |
|------|--------|
| Circuit Mirror grid + Live/Saved/Splot | **Exists** — extended with last-touched + activity labels |
| `activeCircuitTrack` / macro CC 21–28 | **Exists** — extended with intel last-touched + disableable auto-focus |
| BPM from clock / Project PC ch16 / Section Bridge | **Exists** — position model + informational PC; Section Bridge unchanged |
| Track mute inference → hardware | **Not built** (by design — never auto-mute) |
| Shared musical-event timeline UI | **Foundation** (ring log) — full Performance Memory later |
| Simulated Vitest | **New** — `circuit-intelligence.test.ts` |
| Fragile | Browser main-thread clock; sparse/probability patterns → false Possible mute |

## Hardware checklist (Patryk)

Mark **verified** only after you confirm. Until then leave **experimental**.

1. Setup → Circuit MIDI **in** assigned.
2. Build → Splot pattern → **Circuit Live**.
3. Press **Play** on Circuit — position bar/beat should move; Mirror playhead moves.
4. Select a track on Circuit and twist a macro — **Last-touched** shows that track (High). With auto-focus on, Live controller highlights it.
5. Turn **Auto-focus** off — twist another track’s macro; last-touched updates but controller focus does not jump.
6. Mute a track that was playing for a few loops — after a silent loop, label may show **Possible mute** (Low). Confirm mute on Circuit; Splot must **not** mute SP/FM1/MPC by itself.
7. Confirm MPC / SP / FM1 still play exactly as before (routing unchanged).

## Limits

See [limitations.md](./limitations.md) and [circuit-mirror.md](./circuit-mirror.md). Stock Circuit MIDI does not report mute/scene state — inference is probabilistic.
