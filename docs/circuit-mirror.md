# Circuit Mirror

**Honesty:** **experimental** until Patryk confirms on hardware. Circuit is the instrument; Splot is the window. Live observation is **read-only** and must not change outbound routing to MPC / SP / FM1.

## Modes (Sequencer tab)

| Mode | What it is |
|------|------------|
| **Circuit Live** | Passive 8×16 grid from Circuit **input** MIDI (notes + clock). Loop-aware: dim → bright across cycles; missed steps fade. |
| **Circuit Saved** | Local `.ncs` file via existing Deep Sync parser. Never auto-opens USB file protocol. |
| **Splot Pattern** | Existing editable Splot sequencer (unchanged behaviour). |

Default preference: Circuit Live when Circuit is connected and active; otherwise last saved mode (`localStorage` key `dawlessdaw.circuitMirror.mode`).

## Engine

`CircuitMirrorEngine` in `@dawlessdaw/sequencer` (outside React).

- Clock: 24 PPQN, 6 ticks per 16th (same as `SeqScheduler`).
- Stable `getSnapshot()` (rebuild only on `emit`) for `useSyncExternalStore`.
- Wired from `StudioRuntime` only when `message.portId === circuitIn` — never forwarded OUT clock/notes.
- Diagnostic JSON: **Export diagnostic JSON** on Circuit Live.

## Simulated tests A–J

Vitest: `packages/sequencer/src/circuit-mirror.test.ts` (clock, note landing, loop-aware fade/confirm, ignore bad channels, stop/continue, 8 tracks, snapshot stability, `.ncs` cell map, ignore notes while stopped).

## Hardware checklist (Patryk)

Mark **verified** only after you confirm. Until then leave **experimental / untested**.

1. Setup → Circuit MIDI **in** = your Circuit USB port.
2. Sequencer → **Circuit Live**.
3. On Circuit: press **Play**. Mirror playhead should move.
4. Program hits on tracks 1–8; pads should light (dim first loop, brighter when the loop repeats).
5. Press **Stop** — playhead stops; grid keeps what it learned.
6. Confirm MPC / SP / FM1 still play exactly as before (Controller routing unchanged).
7. Optional: **Circuit Saved** → Open a `.ncs` from disk (Components export / SD copy). Pattern 1–8 switcher shows saved steps.

## Circuit Intelligence

Milestone 1 extends Circuit Live with last-touched (CC 21–28), activity guesses, and musical position. See [circuit-intelligence.md](./circuit-intelligence.md). Still passive — no outbound MIDI from intelligence.

## Limits

See [limitations.md](./limitations.md). Stock Circuit MIDI does not dump unsaved pattern RAM. Browser clock is main-thread.
