# MPC via the Scarlett 2i4

The Mac can't see the MPC One over USB. Instead, the app sends to the MPC through the **Focusrite Scarlett 2i4's MIDI Out**, which is cabled to the **MPC's MIDI In**. The MPC is no longer on the thru box.

**Honesty:** nothing here is confirmed on this studio's hardware until bench tests **g2**, **g3** and **i** are marked Pass. App-side routing (Start / Clock / Stop / Continue / SPP → designated port) is covered by simulation tests.

```
Circuit Rhythm ──USB──▶ Mac (Dawlessdaw) ──USB──▶ Scarlett 2i4 ──MIDI Out (DIN)──▶ MPC One MIDI In
       │
       └──MIDI Out──▶ thru box ──▶ SP-404MKII MIDI In (clock)
```

## Why this works for clock (sequencer follow)

The Akai USB-B port ignores MIDI Clock from a computer — pad/sample **note** hits over USB (or Scarlett) are not the same as starting the **MPC sequencer**. The Scarlett reaches the MPC over a normal **DIN MIDI cable**, so clock + Start/Stop work and the sequence can run with Circuit Play.

Dawlessdaw keeps two route kinds on the same MPC Out port:

| Route | What it carries |
| --- | --- |
| Track notes (T1–T4 → ch9–12) | Pad / sample / instrument hits |
| Transport (`mystudio-clock-mpc`) | Clock, Start, Stop, Continue, Song Position if Circuit sends it |

No MMC is invented — prefer MIDI Clock + Start.

## Cables

- Scarlett 2i4 **MIDI OUT** → MPC One **MIDI IN**.
- The MPC One's MIDI ports are small 3.5 mm jacks. Use the 3.5 mm → 5-pin MIDI adapter that came with the MPC, plugged into the MPC's **MIDI In** jack.
- Scarlett 2i4 → Mac over USB.

## On the Mac

1. Open **Audio MIDI Setup** (Applications › Utilities). Choose **Window › Show MIDI Studio**. The Scarlett should appear as **Scarlett 2i4 USB**.
2. In Dawlessdaw: **Setup tab › Ports › Akai MPC One › MIDI out** = the Scarlett port. This choice is remembered by name, survives reloads and unplugging, and is never replaced automatically. The app never assigns the Scarlett to the MPC by itself, because the Scarlett is also your audio interface and may later drive other gear.
3. **Setup tab › MPC connection** = **App sends notes (USB or Scarlett)**.
4. **Rig tab** / Controller: tracks T1–T4 → **MPC** ch9–12 (preset **MPC + FM1**, or set each track yourself).
5. **MPC follows Circuit Play**: **Setup tab › MPC follows Circuit Play** = **On** (same switch as **Rig › Tempo › → MPC**). This sends only transport (clock / start / stop / continue / SPP) to the MPC Out port — never notes or knobs. Notes keep using their own routes.
6. Leave **→ SP** tempo **OFF**. The SP already gets clock from the thru box. Turn it on only if you take the SP off the thru box, because otherwise the SP may get double clock.

## On the MPC One (MPC 3)

Menu names may differ slightly between MPC firmware versions.

1. **Menu › Preferences › MIDI / Sync**:
   - In the list of MIDI inputs, turn **on** the row for the MPC's **MIDI In** (the DIN/3.5 mm port).
   - **Sync › Receive** = **MIDI Clock**. If there's an input choice, pick the **MIDI In** port.
   - **Send MIDI Clock** = **off**, and **MTC** send off. The MPC must not send clock back.
2. For each of **tracks 1–4**: set the track's **MIDI input** to the **MIDI In** port and its channel to **9, 10, 11, 12** (track 1 = ch9 … track 4 = ch12). Not "All": a track on All plays every channel.
3. Set each of those tracks' **monitoring to always on (In)** rather than **Auto**. On Auto the MPC only plays incoming notes on the *selected* track, so you'd hear just one Circuit track at a time. With In, every track plays its own channel at once (e.g. drums on track 1 and a synth on track 2).

## On the Circuit Rhythm

- Setup view (hold **Shift**, press **Save**): **Note Tx** on, **Clock Tx** (pad 32) bright.

## What the app sends to the MPC

| From | To the MPC Out (Scarlett) |
| --- | --- |
| Circuit track 1 notes (ch1) | ch9 |
| Circuit track 2 notes (ch2) | ch10 |
| Circuit track 3 notes (ch3) | ch11 |
| Circuit track 4 notes (ch4) | ch12 |
| Circuit clock / start / stop / continue / SPP | only when **MPC follows Circuit Play** is ON |
| Section Bridge | Program Change ch15, mute Learn CC20 ch15 |
| SysEx, knobs, Circuit's own Program Changes | never |
| MMC | never (not implemented — use Clock + Start) |

## Timing (bench test i)

The app measures the time from a Circuit note arriving over USB to the moment the app sends it to the MPC Out port, then shows the average delay and the jitter. That covers the **Mac side only**. Not included:
- **Scarlett USB → DIN hop.** A DIN MIDI cable carries one note in about 1 ms, so four notes on the same step go out one after another, and the last arrives about 4 ms after the first.
- **The MPC's own reaction time.**

So trust your ears as well. Mark the test Pass only if it sounds tight.

## Bench tests

- **g2. MPC via Scarlett: notes.** Circuit T1–T4 play MPC tracks 1–4 on ch9–12, with nothing doubled.
- **g3. MPC follows Circuit Play — sequencer runs via Scarlett→DIN.** Pass only when the MPC *sequence* starts/stops with Circuit (not merely note hits). The **Send test Start/Clock/Stop → MPC** button sends a short burst directly from the app.
- **i. Timing Circuit → app → Scarlett → MPC.**

## Switching back

If the MPC goes back on the thru box, choose **MIDI cable from thru box only**. The app then sends the MPC nothing, notes and clock included, and MPC tracks 1–4 listen on ch1–4.
