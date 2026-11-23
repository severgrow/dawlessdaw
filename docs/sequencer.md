# Splot sequencer + Circuit Mirror

The **Sequencer** tab has three modes. See [circuit-mirror.md](./circuit-mirror.md).

| Mode | Meaning |
|------|---------|
| **Circuit Live** | Read-only loop-aware observation of Circuit **input** MIDI (**experimental**) |
| **Circuit Saved** | View a local `.ncs` session file (not live RAM) |
| **Splot Pattern** | Editable **8×16** grid owned by Splot and serialised locally |

## Honesty labels

| Label | Meaning |
|-------|---------|
| **Splot Pattern** | The editable grid / bank persisted by the app |
| **Circuit Live** | Passive mirror of performance MIDI — not Circuit’s stored pattern RAM |
| **Circuit Pattern Unavailable** | Stock Circuit MIDI does not expose unsaved internal pattern dumps |

## Clock

- **Default:** Splot listens to Circuit clock and routes the hardware performance. Press **Play in Splot** to layer the selected Splot pattern on the Circuit clock. Once enabled, the pattern follows Circuit Start, Stop and Continue. Press **Stop in Splot** to disable the pattern while Circuit routing stays live. Transport forwarding to hardware is controlled separately.
- **Internal BPM:** look-ahead scheduler using `performance.now()` + Web MIDI output timestamps. Useful without Circuit running. **Never** sends MIDI clock out.

## Routing

Scheduled notes inject into the existing `MidiRoutingEngine` as Circuit track channels 1–8, so **Controller destinations** (SP / FM1 / MPC), transpose, and channel remap apply — no duplicate destination map.

## Browser timing limits

Web MIDI runs on the **main thread**. Look-ahead timestamps reduce jitter but are **not sample-accurate**. Prefer hardware DIN thru for tight multi-device sync; treat USB sequencing as playable, not as a replacement for a hardware clock.

## Persistence

Bank JSON in `localStorage` key `dawlessdaw.sequencer.v1` (`schemaVersion: 1`). Undo/redo is in-memory per active pattern slot.

## FLIP lane

Under the 8 MIDI tracks: hardware audio loop capture (Scarlett / ZED / etc.). Not a 9th MIDI track; Circuit audio unused. Reuses Session Recorder PCM / IndexedDB / WAV. See [flip.md](./flip.md).
