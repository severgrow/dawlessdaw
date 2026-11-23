# Phase 2 — deeper Circuit Rhythm integration

**Status: experimental** until Patryk confirms on hardware. Splot listens and routes; it never flashes firmware, never invents SysEx, and never opens the USB file protocol without an explicit confirm.

## Citations

| Source | Use |
|--------|-----|
| [Circuit Rhythm Programmer’s Reference Guide v5](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_programmer_s_reference_guide_v5_2.pdf) | Track channels 1–8, Project PC ch16, macro CC 21–28, Mixer Level/Pan CC 29/30, Note/CC/PC/Clock Tx independence |
| [User Guide MIDI appendix](https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix) | MIDI channel defaults, transmit tables |
| [Sync KB](https://support.novationmusic.com/hc/en-gb/articles/24060538791570-Keeping-multiple-Circuit-Tracks-and-Circuit-Rhythm-s-in-sync) | Project Tx from FW 2.0.1; one clock leader |

## What this phase adds

1. **Build → Circuit** — setup checklist with pictures; live Note / CC / PC / Clock ticks as messages arrive on Circuit USB in.
2. **“What’s my Circuit doing”** — reuses Circuit Intelligence (passive); never auto-mutes.
3. **64-slot project grid** — user names + colours (localStorage); ties into song sections.
4. **Knob soft takeover** — off by default; unit-tested shared pickup with Super Macros (M3). Toggle on Controller or Circuit.
5. **Song section cards** — drag reorder setlist view; Section Bridge matching still by project number.
6. **`.ncs` import** — local / SD card reader first; USB file protocol only after Deep Sync confirm (stops transport).
7. **Mute bench procedure** — [mute-bench.md](./mute-bench.md); inferred mute stays labelled.
8. **Arrhythmia** — design-only [arrhythmia-module.md](./arrhythmia-module.md); no firmware install.

## Reuses

- Circuit Intelligence / Mirror / Super Macros / Performance Memory / Section Bridge.

## Hardware checklist (owner)

1. Settings → Ports: Circuit in + out assigned.
2. Build → Circuit: work the setup checklist; twist a macro → CC tick; Play → Clock tick; change Project → PC tick.
3. Name a few Projects in the 64-grid; map them under Song sections; change Project on the Circuit.
4. Leave soft takeover **off** unless testing Super Macros jump avoidance.
5. Open a local `.ncs` from an SD card under Splot pattern → Circuit Saved. Do **not** use USB file protocol while jamming.

## Tests

`packages/devices` soft-takeover + circuit-projects unit tests. They do not prove hardware TX behaviour.
