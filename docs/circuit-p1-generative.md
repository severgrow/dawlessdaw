# Circuit P1 — generative sequencing

**Honesty:** **experimental / untested** until Patryk Bench-Passes on hardware.  
**Brand:** Splot MIDI Brain. Circuit is the instrument; Splot is the smarter window + generator.  
**Not in this PR:** Guided Record (P3), `.ncs` writer (P4), invented button MIDI, SysEx, firmware, second clock master.

## What shipped

| Piece | Where | Notes |
|-------|--------|------|
| Scale engine | `@dawlessdaw/sequencer` `scale.ts` | Listed scales, root, density, mutation amount, seeded RNG |
| Observation reconstruct | `observation.ts` | Mirror bright/dim/empty → **observed / inferred / empty** — not RAM dump |
| Generative workspace | `generative.ts` | Source vs working, locks, generate, mutate, one-note edit, undo |
| Circuit MIDI out | `circuit-midi-out.ts` + runtime | Opt-in **Hear Circuit** — notes on ch 1–8 only; echo guard; no clock out |
| UI | Build → Pattern | Premium dark-glass strip; Live/Saved **Use as source** |

## Honesty gates (from capability matrix)

- Live observation = performance MIDI inference only.
- Hear on Circuit = Note Rx audition, **not** Guided Record, **not** pattern memory write.
- Clock: Circuit remains master by default; app does not inject a second clock.
- No SysEx / invented mute-scene-pattern button MIDI.

## How to try (software)

1. Build → Pattern.
2. Set Root / Scale / Density / Seed → **Generate**.
3. Right-click a pad (or **Lock** on the step editor) → **Mutate** — locked steps stay.
4. **Undo** restores the previous working variation (source unchanged).
5. Optional: Live → play Circuit → **Use as source** → Generate / Mutate on Pattern.
6. Optional: assign Circuit Out on Setup → **Hear Circuit** (experimental).

## Hardware checklist (owner — mark Pass/Fail)

1. Note Tx: Circuit Play → Live shows observed/inferred cells.
2. Use as source → Generate → Play Pattern → destinations still fire (MPC/SP/FM1).
3. Hear Circuit ON + Note Rx ON → Circuit samples trigger from Splot notes (Record **off**).
4. Confirm Mirror does **not** light from our own Hear Circuit notes (echo guard).
5. Confirm app does not emit MIDI clock when Hear Circuit is on.
6. Locks survive Mutate; Reset restores unlocked from source.

## Tests

Vitest: `scale.test.ts`, `generative.test.ts`, `observation.test.ts`, `circuit-midi-out.test.ts`.  
Software green ≠ hardware proof.
