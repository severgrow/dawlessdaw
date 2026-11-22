# D — Circuit Rhythm as eight-track studio arranger

Circuit Rhythm ≠ Circuit Tracks. All claims below are for **Rhythm** only.

## Goal

Use Circuit as an optional physical arranger for MPC One, SP-404MKII, and FM1 while any device may remain clock master.

## What is Confirmed

| Fact | Evidence |
|------|----------|
| Default tracks 1–8 → MIDI channels 1–8; channel 16 = Project | [User Guide MIDI channels](https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix) |
| Independent Note / CC / PGM / Clock Tx & Rx | Same |
| Macro + sampler CCs on per-track channels; FX CCs/NRPNs | [PRG Guide v5](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_programmer_s_reference_guide_v5_2.pdf) |
| Project select via PGM ch16: 0–63 instant, 64–127 queued | PRG + [sync KB](https://support.novationmusic.com/hc/en-gb/articles/24060538791570-Keeping-multiple-Circuit-Tracks-and-Circuit-Rhythm-s-in-sync) |
| From FW 2.0.1, Project changes **transmit** matching PGM | Sync KB |
| Scenes can store mute states; Mute Recall Mode optional | [FW 2.0 addendum](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_2.0_firmware_update_addendum_v1_english_en.pdf) |
| No official SysEx in Programmer’s Reference | PRG / subsystem “not recorded” |

## Arrangement approaches

### A. Direct sequencing — **feasible now (Confirmed path)**

Circuit sequences notes on ch 1–8; Dawlessdaw routes each channel to destinations.

Example (logical):

| Circuit track | Ch | Role | Destinations |
|---------------|----|------|--------------|
| 1–2 | 1–2 | drums | SP-404MKII pads / MPC drum track |
| 5 | 5 | bass | MPC bass program **or** FM1 track |
| 6–7 | 6–7 | keys/lead | FM1 |
| 8 | 8 | fx/utility | SP EFX triggers / muted internally |

Constraints:

- Tracks are **sample tracks** (often monophonic sample playback on-device). External MIDI notes still go out when Note Tx is on — **Hardware testing required** for exact polyphony and mute interaction.
- Keep **Clock Tx** on one leader only (Circuit *or* MPC *or* SP). Dawlessdaw `clockAuthorityPortId` must match.
- Multiple destinations per track: Dawlessdaw multi-dest routes (already implemented).

### B. Loop triggering — **Plausible**

Map Circuit notes/CCs to SP pad launches or MPC pad hits (note remap). Pattern PC to SP (RX confirmed) for section changes. Requires prepared pads/loops on targets.

### C. Remote arrangement (MPC mutes / sequences) — **Plausible via MIDI Learn, not verified**

Flow:

1. Dawlessdaw (or Circuit CC/note) → MPC port with **Control** enabled.
2. MPC MIDI Learn: Source track → Target Mixer Mute (Toggle), etc. ([Akai Learn](https://support.akaipro.com/en/support/solutions/articles/69000858700-akai-pro-mpc-series-mapping-plugin-instruments-fx-parameters-via-midi-learn)).
3. Circuit Project/Scene gestures → translated CCs.

**Do not claim this works until hardware-tested.** Transport Learn is explicitly unsupported (MMC required).

Plugin SDK companion **cannot** replace this: plugins cannot send MIDI to the MPC host.

## Scenes vs Projects (critical)

- **Project** change → observable PGM on ch16 (Confirmed Tx from 2.0.1).
- **Scene** change → primarily internal pattern-chain + optional mute recall. **No dedicated Scene MIDI message found in PRG.** Treat Scene→Dawlessdaw Scene sync as **Hardware testing required** / likely needs inference (e.g. sudden multi-track mute via missing Note Tx) or user-mapped controls.

## Mute behaviour

When a track is muted on Circuit:

- Internal sample playback mutes (Confirmed product behaviour).
- Whether Note Tx stops for that channel: **Hardware testing required** (expected but not quoted in PRG tables).
- Saved mutes in Scenes do not by themselves emit a mute CC unless macros/levels change.

## Recommended Dawlessdaw mode: “Direct + Project Scene bridge”

1. Direct sequencing routes (A) as default arranger profile.
2. Observe ch16 PGM → optionally recall a mapped Dawlessdaw Studio Scene.
3. Leave approach C as an optional Learn pack after bench testing.
4. Never require custom Circuit firmware.

## MIDI routing sketch

```
Circuit USB MIDI In ──► Dawlessdaw
   ch1 notes ──► SP out (drums)
   ch2 notes ──► SP out
   ch5 notes ──► MPC out (bass program)
   ch6 notes ──► FM1 out
   clock     ──► SP + MPC + FM1 (if Circuit is authority)
   ch16 PGM  ──► Dawlessdaw Scene map (no firmware write)
```

Audio still sums on **ZED-10FX** (physical); Dawlessdaw does not control the mixer digitally.
