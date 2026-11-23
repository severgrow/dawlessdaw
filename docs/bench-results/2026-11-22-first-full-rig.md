# Bench: first full rig — 22 Nov 2026

Owner: Patryk. Status labels: **verified** (he confirmed) · **untested** · **experimental**.

Cloud sessions cannot hear or see the gear. Only marks below that he confirmed that day are **verified**.

## Verified (22 Nov 2026)

Sequences built on Circuit Rhythm played correctly through the app:

| Circuit tracks | Destination | Path | Status |
|---|---|---|---|
| T1–T4 | MPC One | App → Focusrite Scarlett 2i4 MIDI Out → MPC MIDI (DIN) In | **verified** |
| T5–T6 | M-VAVE FM1 / Skiff (USB name "Felucca") | USB → Skiff tracks 1–2 | **verified** |
| T7–T8 | Roland SP-404MKII (stock FW 5.52) | USB | **verified** |

Also confirmed that day:

- Circuit Rhythm stock 2.x MIDI Out → thru box → SP DIN clock (hardware clock path).
- MPC is **not** visible over its own USB; Scarlett DIN is the working note/clock path.
- ZED-10FX = USB audio only ("USB Audio CODEC") — no MIDI.
- FM1 must **never** sit on the thru box.
- App default clock forwarding stays **off** (thru box / Scarlett DIN as above).

This routing is captured as Controller preset **Ploe Live v1** (SP banks A–B on T7–T8 by default; banks are easy to change on Controller).

## Untested / not claimed Pass that day

Do **not** treat these as verified from 22 Nov:

- Bench checklist rows not explicitly walked (a–d Circuit, e/h5/h6 SP, g2–g4/i MPC latency, h/h2–h4 Skiff knobs, reconnect, etc.).
- SP effect CTRL mapping (h6).
- MPC MIDI Learn / mute CC steps.
- SP USB serial (CDC) read-only spike (experimental; target FW was 5.51; Patryk on 5.52).
- Session Recorder / FLIP live capture from Scarlett or ZED.
- Circuit Deep Sync / `.ncs` file protocol beyond research.

## Notes for next bench export

When Patryk marks Pass/Fail in the Test tab, export JSON to `docs/bench-results/<date>.json` and keep this narrative file for the verified story.
