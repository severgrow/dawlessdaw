# Dawlessdaw 8-track visual MIDI sequencer

Circuit-inspired **8 tracks × 16 steps** pad grid. Patterns are **Dawlessdaw-owned** and serialised locally. This is **not** a view of Circuit Rhythm’s internal stored patterns.

## Honesty labels

| Label | Meaning |
|-------|---------|
| **Dawlessdaw Pattern** | The editable grid / bank persisted by the app |
| **Live MIDI Activity** | Optional monitor of Circuit notes observed over USB |
| **Circuit Pattern Unavailable** | Stock Circuit MIDI does not expose stored pattern dumps for this UI |

## Clock

- **Default:** follow Circuit as clock master (Start / Stop / Continue + Timing Clock). The app still forwards transport to MPC/SP/FM1 only when those switches are already on — the sequencer does **not** emit a second MIDI clock.
- **Internal BPM:** look-ahead scheduler using `performance.now()` + Web MIDI output timestamps. Useful without Circuit running. **Never** sends MIDI clock out.

## Routing

Scheduled notes inject into the existing `MidiRoutingEngine` as Circuit track channels 1–8, so **Controller destinations** (SP / FM1 / MPC), transpose, and channel remap apply — no duplicate destination map.

## Browser timing limits

Web MIDI runs on the **main thread**. Look-ahead timestamps reduce jitter but are **not sample-accurate**. Prefer hardware DIN thru for tight multi-device sync; treat USB sequencing as playable, not as a replacement for a hardware clock.

## Persistence

Bank JSON in `localStorage` key `dawlessdaw.sequencer.v1` (`schemaVersion: 1`). Undo/redo is in-memory per active pattern slot.
