# Circuit P2 — Hardware Control Mode

**Honesty:** **experimental / untested** until Patryk Bench-Passes macro TX + control mode.  
**Stacked on:** Circuit P1 generative.  
**Not in this PR:** Guided Record (P3), `.ncs` writer (P4), invented button MIDI, SysEx, firmware.

## What shipped

| Piece | Notes |
|-------|--------|
| Opt-in Hardware Control Mode | Off by default — Ploe Live / 8-track MPC·SP·FM1 routes unchanged |
| Macros CC 21–28 | Root / scale / density / mutation / seed / Generate / Mutate / Reset |
| Optional Mixer 29/30 | Level→lock step · Pan→undo (gated) |
| Trigger hysteresis | Schmitt low/high so Generate/Mutate fire once per twist past threshold |
| Adaptive Hardware Guide | Next-action + button gestures Guide-only (mute/scene/pattern/track/record) |

## Mapping (default)

| CC | Panel | Action | Kind |
|----|-------|--------|------|
| 21 | Tune | Root | continuous |
| 22 | Start | Scale | continuous |
| 23 | Length | Density | continuous |
| 24 | Slope | Mutation amt | continuous |
| 25 | Distortion | Seed | continuous |
| 26 | HPF | Generate | trigger + hysteresis |
| 27 | LPF | Mutate | trigger + hysteresis |
| 28 | Resonance | Reset→source | trigger + hysteresis |
| 29 | Mixer Level | Toggle lock | trigger (opt-in) |
| 30 | Mixer Pan | Undo | trigger (opt-in) |

## Safety

- Mode **off** → engine ignores all CCs; Controller routing untouched.  
- No SysEx. No invented mute/scene/pattern button messages.  
- Circuit remains clock master.  
- Not Guided Record — Record button stays on-device Guide text only.

## How to try

1. Setup → Circuit MIDI **in**; Circuit **CC Tx ON**.  
2. Build → Pattern → capture a **Source** (or Live → Use as source).  
3. **Hardware control → Mode ON**.  
4. On Circuit: select a track, twist macros — density/root move; twist HPF past ~90 for Generate.  
5. Leave Mode **OFF** to jam with Ploe Live destinations only.

## Tests

`packages/sequencer/src/hardware-control.test.ts` — mapping, hysteresis, mode-off ignore, Guide buttons.  
Software ≠ hardware proof.
