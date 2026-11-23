# MMT-8 lessons → SPLOT (research only)

**Status:** research / docs. Tip baseline: Phase 3 stack (`cursor/phase-3-sp404-1b11`).  
**Upstream:** [audiodestrukt/mmt8](https://github.com/audiodestrukt/mmt8) — **no licence clarity; proprietary firmware present.** Do not copy firmware, decompiled code, emulator binaries, or fixtures into this repo. No MMT-8 dependency.

## Useful ideas (not products)

1. **Behavioural specs** — given MIDI + elapsed time, assert outbound MIDI / transport. SPLOT uses Vitest + `MockMidiTransport` toward this.
2. **Timestamped performance events** — beyond step grids (Performance Memory / Intelligence already lean this way).
3. **Timing path ≠ UI** — keep routing / clock authority off the React tree.
4. **Arrangement parts** — map carefully to Song sections / Moments; do not invent Circuit Scene MIDI.
5. **Persistence as tests** — save/restore behaviour checks (future).

## Already covered on tip (do not duplicate)

Circuit Mirror / Intelligence, Timing Lab, Performance Memory, Mock MIDI + routing Vitest, sequencer + Session Recorder + FLIP, Super Macros / soft takeover.

## Gap summary

See agent store `internal/mmt8-gap-analysis.md` for the table. Short version: need stronger shared behavioural fixtures for Note On/Off safety, Start/Stop/Continue, clock loss, and no hanging notes on route change — not a new product surface.

## Implementation checkpoint

Steps 1–2: gap table + Vitest behavioural strengthening (tip).  
**Step 4 / plan step 7:** headless `MidiEventRecorder` in `@dawlessdaw/midi` — bounded, timestamped, incoming vs outbound source tags; no live-routing side effects; no MMT-8 code. See [midi-event-recorder.md](./midi-event-recorder.md).  
**Step 5 / plan step 8:** rolling `RollingMidiCapture` — capture last N bars, bar-align only when clock confident; Sessions button. See [capture-last-n-bars.md](./capture-last-n-bars.md).
