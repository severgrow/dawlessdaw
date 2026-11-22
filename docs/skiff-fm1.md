# FM1 on Skiff — Circuit tracks 5–8

Skiff ([illuminus5/skiff](https://github.com/illuminus5/skiff), GPL-3.0, built on Felucca) turns the FM1 into a six-track groovebox. Each Skiff track can listen on its own MIDI channel, so Circuit tracks 5–8 can each play their own Skiff track.

Everything below is **untested on this studio** until Bench Test h, h2 and h3 are marked Pass.

## Setup

### On the FM1 (Skiff)
1. MENU › MIDI › **T1 CHANNEL = 1, T2 = 2, T3 = 3, T4 = 4** (Skiff default; matches My Studio). Per-track channels need Skiff 1.3 or newer.
2. If you previously set T1–T4 to **5–8** for the old Rig grid, set them back to 1–4, **or** open Controller → Advanced → Skiff track channels and match the box.
3. Optional: CLOCK = USB, to follow the Circuit's tempo through the app.

### On the Circuit Rhythm
1. Load **empty samples** on tracks 5–8. Macro knobs change the Circuit's own sound too.
2. Setup view: Note Tx and CC Tx on.

### In Dawlessdaw
1. Setup tab → FM1 firmware → **Skiff** (default).
2. Controller tab → preset **My Studio · T1–4 → SP** (or the MPC variant). T5–T8 play Skiff tracks 1–4 on channels 1–4.
3. Optional: Rig tab → Tempo → **→ FM1** on (with Skiff CLOCK = USB).
4. Keep the FM1 **off the thru box**. It should only get what the app sends it over USB.

## What gets sent (My Studio)

| Circuit | → FM1 (Skiff) |
| --- | --- |
| Track 5 notes (ch5) | Skiff T1 (app out ch1) |
| Track 6 notes (ch6) | Skiff T2 (app out ch2) |
| Track 7 notes (ch7) | Skiff T3 (app out ch3) |
| Track 8 notes (ch8) | Skiff T4 (app out ch4) |
| Macro 1 (CC21) | CC74 brightness |
| Macro 2 (CC22) | CC71 resonance |
| Macro 3 (CC23) | CC73 attack |
| Macro 4 (CC24) | CC75 decay |
| Macro 5 (CC25) | CC72 release |
| Macro 6 (CC26) | CC94 delay send |
| Macro 7 (CC27) | CC91 reverb send |
| Macro 8 (CC28) | **Level** (CC7) |
| Mixer Level (CC29) | CC7 LEVEL (Skiff track level) |
| Mixer Pan (CC30) | CC10 PAN |

**Sound (steps)** is an optional knob target (Program Change zones). It is no longer the My Studio default for macro 8 — pick it on any knob if you want the old sound-step behaviour (bench h4).

Mixer Level/Pan are separate from the macros: Circuit Setup → CC Tx ON → press Mixer (▼ lit) → turn a Macro for that track. App sends CC7/CC10 on the routed out. Edit defaults in `packages/devices/src/studio-layout.ts` (`CIRCUIT_MIXER_TO_DEST_CC`).

Every other CC and all of the Circuit's own Program Changes are dropped unless you map them. Edit targets on the Controller tab (Advanced shows real CC numbers).

### Optional sound knob

Skiff 1.3+ loads "the track's nth preset of its engine" when it gets Program Change on that track's channel. Map **Sound (steps through 8)** on a knob: the app splits the knob into 8 equal zones and sends one Program Change per zone on the Skiff track's channel.

- It steps through the sounds of the engine already on that track. Pick the engine on the FM1 itself.
- Every Skiff engine has at least 8 sounds. Skiff doesn't document what happens past an engine's last sound — test with bench h4.
- Macro 8 in My Studio is Level (CC7). You can also set levels via Circuit **Mixer** view (CC29 → CC7), on the FM1, or on the hardware mixer.

Circuit tracks play one note at a time, so each Skiff track gets single-note lines. Skiff shares 8 voices across its tracks (12 with its second-core beta).

## MPC

The MPC now gets its notes and clock through the Scarlett 2i4 — see [mpc-via-scarlett.md](./mpc-via-scarlett.md). If it goes back on the thru box, choose Setup → MPC connection → **MIDI cable from thru box only**: the app then sends the MPC nothing, and MPC tracks 1–4 listen on channels 1–4.

## Switching back to h1

Setup → FM1 firmware → **h1** restores the older path: tracks 5–6 only, notes only. h1 plays every channel, so never put it on the thru box.
