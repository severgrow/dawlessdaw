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
2. Optional: Settings → App clock forwarding → **Circuit clock → FM1** ON (with Skiff CLOCK = USB).
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
| Macro 8 (CC28) | **Sound knob**: steps the track's Skiff sound (Program Change 0–7) |

Every other CC and all of the Circuit's own Program Changes are dropped, so nothing else on the Circuit changes Skiff by accident. To change the knob map, edit `CIRCUIT_MACRO_TO_SKIFF_CC` in `packages/devices/src/studio-layout.ts`.

### The sound knob (macro 8)

Skiff 1.3+ loads "the track's nth preset of its engine" when it gets Program Change on that track's channel. The app splits macro 8 into 8 equal zones. Turning into a new zone sends one Program Change on the same channel (ch5 → Skiff T1, ch6 → T2, and so on), so each track changes sound on its own. It sends nothing while the knob stays inside a zone, so a sweep never floods the FM1.

- It steps through the sounds of the engine already on that track. Pick the engine on the FM1 itself.
- Every Skiff engine has at least 8 sounds, which is why the default is 8 steps. To get more steps, change `SKIFF_SOUND_KNOB_STEPS`. Skiff doesn't document what happens past an engine's last sound, so test it with bench test h4 first.
- To use a different macro, change `SKIFF_SOUND_KNOB_CC`.
- Macro 8 used to be level (CC7). Set levels on the FM1 or the mixer instead.

Circuit tracks play one note at a time, so each Skiff track gets single-note lines. Skiff shares 8 voices across its tracks (12 with its second-core beta).

## MPC

The MPC now gets its notes and clock through the Scarlett 2i4 — see [mpc-via-scarlett.md](./mpc-via-scarlett.md). If it goes back on the thru box, choose Settings → MPC connection → **MIDI cable from thru box only**: the app then sends the MPC nothing, and MPC tracks 1–4 listen on channels 1–4.

## Switching back to h1

Settings → FM1 firmware → **h1** restores the older path: tracks 5–6 only, notes only. h1 plays every channel, so never put it on the thru box.
