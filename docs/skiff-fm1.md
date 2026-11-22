# FM1 on Skiff — Circuit tracks 5–8

Skiff ([illuminus5/skiff](https://github.com/illuminus5/skiff), GPL-3.0, built on Felucca) turns the FM1 into a six-track groovebox. Each Skiff track can listen on its own MIDI channel, so Circuit tracks 5–8 can each play their own Skiff track.

Everything below is **untested on this studio** until Bench Test h, h2 and h3 are marked Pass.

## Setup

### On the FM1 (Skiff)
1. MENU › MIDI › T1 CHANNEL = 5, T2 = 6, T3 = 7, T4 = 8 (per-track channels need Skiff 1.3 or newer).
2. Optional: CLOCK = USB, to follow the Circuit's tempo through the app.

### On the Circuit Rhythm
1. Load **empty samples** on tracks 5–8. Macro knobs change the Circuit's own sound too.
2. Setup view: Note Tx and CC Tx on.

### In Dawlessdaw
1. Settings → FM1 firmware → **Skiff** (default).
2. Optional: Settings → **Circuit clock → FM1 over USB** ON (with Skiff CLOCK = USB).
3. Keep the FM1 **off the thru box**. It should only get what the app sends it over USB.

## What gets sent

| Circuit | → FM1 (Skiff) |
| --- | --- |
| Track 5 notes (ch5) | Skiff T1 |
| Track 6 notes (ch6) | Skiff T2 |
| Track 7 notes (ch7) | Skiff T3 |
| Track 8 notes (ch8) | Skiff T4 |
| Macro 1 (CC21) | CC74 brightness |
| Macro 2 (CC22) | CC71 resonance |
| Macro 3 (CC23) | CC73 attack |
| Macro 4 (CC24) | CC75 decay |
| Macro 5 (CC25) | CC72 release |
| Macro 6 (CC26) | CC94 delay send |
| Macro 7 (CC27) | CC91 reverb send |
| Macro 8 (CC28) | CC7 level |

Every other CC and all Program Changes are dropped, so nothing else on the Circuit changes Skiff by accident. To change the knob map, edit `CIRCUIT_MACRO_TO_SKIFF_CC` in `packages/devices/src/studio-layout.ts`.

Circuit tracks play one note at a time, so each Skiff track gets single-note lines. Skiff shares 8 voices across its tracks (12 with its second-core beta).

## MPC "MIDI cable only" mode

If the Mac can't see the MPC over USB, choose Settings → MPC connection → **MIDI cable only**. The app then sends the MPC nothing. On the MPC, set tracks 1–4 to listen to the MIDI (DIN) port on channels 1–4: they hear the Circuit through the thru box, with no Mac involved.

## Switching back to h1

Settings → FM1 firmware → **h1** restores the older path: tracks 5–6 only, notes only. h1 plays every channel, so never put it on the thru box.
