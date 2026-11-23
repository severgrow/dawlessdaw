# Mute bench procedure (Circuit Rhythm)

**Status: hardware-testing-required.** This document is a procedure only. Do not mark Pass from a cloud session.

## What we know from docs

- Scenes can store mute states; Mute Recall Mode is optional (FW 2.0 addendum).
- Programmer’s Reference v5 does **not** define a dedicated “mute” CC for tracks.
- When a track is muted on the Circuit, internal sample playback mutes (product behaviour).
- Whether **Note Tx stops** for that channel while muted: **not quoted** in PRG tables → treat as unknown until you hear it.

## Splot labels (do not change)

| Label | Meaning |
|-------|---------|
| **Possible mute** | Circuit Intelligence guess from missing notes / activity drop. **Inferred** — never drives outbound mute or auto-fill. |
| **Confirmed** | Only for Project Change (PC ch16) and other explicitly decoded MIDI. |

Inferred mute must stay labelled **inferred** in Performance Memory and Intelligence panels. Section Bridge event-actions never auto-fill SP/MPC from inferred mute.

## Bench steps (plain English)

1. Build a simple 4-on-the-floor on Circuit T1 with Note Tx on. Confirm Splot Build → Circuit shows **Note** ticks and T1 activity.
2. Mute T1 on the Circuit mixer (hardware mute).
3. Watch for 4–8 bars:
   - Do Note ticks / Intelligence activity for T1 stop?
   - Does the label become **Possible mute** (inferred)?
4. Unmute T1 — notes should return.
5. Repeat with Scene mute recall if you use Scenes (no Scene MIDI in PRG — do not expect a PC).
6. Record Pass / Fail / Unsure in Tests → Bench, export JSON to `docs/bench-results/`.

## Closest honest alternative if Note Tx continues while muted

Use Super Macros / Controller Level (CC29 → dest volume) or MPC MIDI Learn mute (bench mute CC ch15) as a **user-mapped** mute path — never claim Circuit mute is MIDI-confirmed until this bench Passes.
