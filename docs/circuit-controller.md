# Circuit Controller

Turns the Circuit Rhythm into a controller for the SP-404MKII, FM1 (Skiff) and MPC One. Notes and the 8 macro knobs are mapped in plain words; everything unmapped is dropped. Never SysEx. Never Program Change or CC unless you mapped it.

Open the **Controller** tab (keyboard **2**). The Rig tab only shows a read-only track summary — edit routing here.

## My Studio (built-in)

| Circuit | Plays | Knobs (default) |
|---|---|---|
| T1–T4 | SP banks A–D **or** MPC tracks 1–4 | SP: none until you map effect CTRL; MPC: Learnable 1–8 |
| T5–T8 | Skiff tracks 1–4 | Brightness, Resonance, Attack, Decay, Release, Delay, Reverb, **Level** |

Skiff MIDI channels default to **1–4** (track n = channel n). Set the FM1 the same way:

1. FM1: **MENU › MIDI › T1–T4 CHANNEL = 1, 2, 3, 4**
2. If you previously used 5–8 for the old Rig grid, set them back, or open **Advanced → Skiff track channels** and match what is on the box.

Presets save/load/rename in the Controller bar and are included in **Sessions** export/import. There is no Scenes UI.

## Learn & knobs

- **Play the first note** — Circuit note that should hit pad 1 (SP / MPC pad map).
- **Twist to pick** — press, then turn the real Circuit macro you want for that slot.
- **Test** — slow CC sweep min→max→min so you can hear/see the destination move.
- **Advanced** — MIDI channels, CC numbers, Custom CC, Skiff channel table.

Honest limit: Circuit buttons (mute, scenes, patterns, track select) do **not** send MIDI, so they cannot be mapped.

## Device colours

- SP = deep burgundy `#9a2a45`
- FM1 = pastel mint
- MPC = bone `#e8e1d2`

## Hardware still unverified

SP effect CTRL CCs (16–19, 80–83), MPC menu names / pad map, Skiff Program Change edge cases, and Circuit macro CC 21–28 per track are assumed from docs — mark the matching bench tests only after you hear them on the gear. Do not treat software Pass as hardware Pass.
