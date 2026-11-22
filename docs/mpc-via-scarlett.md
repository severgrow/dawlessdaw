# MPC via the Scarlett 2i4

The Mac can't see the MPC One over USB. Instead, the app sends to the MPC through the **Focusrite Scarlett 2i4's MIDI Out**, which is cabled to the **MPC's MIDI In**. The MPC is no longer on the thru box.

Nothing here is confirmed on this studio's hardware until bench tests **g2**, **g3** and **i** are marked Pass.

```
Circuit Rhythm ──USB──▶ Mac (Dawlessdaw) ──USB──▶ Scarlett 2i4 ──MIDI Out (DIN)──▶ MPC One MIDI In
       │
       └──MIDI Out──▶ thru box ──▶ SP-404MKII MIDI In (clock)
```

## Why this works for clock

The Akai USB-B port ignores MIDI Clock from a computer. The Scarlett reaches the MPC over a normal **DIN MIDI cable**, so that limit doesn't apply, and the MPC can follow the Circuit's tempo, start and stop.

## Cables

- Scarlett 2i4 **MIDI OUT** → MPC One **MIDI IN**.
- The MPC One's MIDI ports are small 3.5 mm jacks. Use the 3.5 mm → 5-pin MIDI adapter that came with the MPC, plugged into the MPC's **MIDI In** jack.
- Scarlett 2i4 → Mac over USB.

## On the Mac

1. Open **Audio MIDI Setup** (Applications › Utilities). Choose **Window › Show MIDI Studio**. The Scarlett should appear as **Scarlett 2i4 USB**.
2. In Dawlessdaw: **Settings › Port assignments › Akai MPC One › Out** = the Scarlett port. This choice is remembered by name, survives reloads and unplugging, and is never replaced automatically. The app never assigns the Scarlett to the MPC by itself, because the Scarlett is also your audio interface and may later drive other gear.
3. **Settings › MPC connection** = **App sends notes (USB or Scarlett)**.
4. **Settings › Circuit tracks 1–4** = **MPC** (or **Both**).
5. To make the MPC follow the Circuit's tempo: **Settings › App clock forwarding › Circuit clock → MPC** = **ON**. This sends only clock, start and stop to the MPC Out port, never notes or knobs.
6. Leave **Circuit clock → SP** **OFF**. The SP already gets clock from the thru box. Turn it on only if you take the SP off the thru box, because otherwise the SP may get double clock.

## On the MPC One (MPC 3)

Menu names may differ slightly between MPC firmware versions.

1. **Menu › Preferences › MIDI / Sync**:
   - In the list of MIDI inputs, turn **on** the row for the MPC's **MIDI In** (the DIN/3.5 mm port).
   - **Sync › Receive** = **MIDI Clock**. If there's an input choice, pick the **MIDI In** port.
   - **Send MIDI Clock** = **off**, and **MTC** send off. The MPC must not send clock back.
2. For each of **tracks 1–4**: set the track's **MIDI input** to the **MIDI In** port and its channel to **9, 10, 11, 12** (track 1 = ch9 … track 4 = ch12).
3. Arm the tracks (or enable MIDI monitoring) so incoming notes play the track's sounds.

## On the Circuit Rhythm

- Setup view (hold **Shift**, press **Save**): **Note Tx** on, **Clock Tx** (pad 32) bright.

## What the app sends to the MPC

| From | To the MPC Out (Scarlett) |
| --- | --- |
| Circuit track 1 notes (ch1) | ch9 |
| Circuit track 2 notes (ch2) | ch10 |
| Circuit track 3 notes (ch3) | ch11 |
| Circuit track 4 notes (ch4) | ch12 |
| Circuit clock / start / stop | only when **Circuit clock → MPC** is ON |
| Section Bridge | Program Change ch15, mute Learn CC20 ch15 |
| SysEx, knobs, Circuit's own Program Changes | never |

## Timing (bench test i)

The app measures the time from a Circuit note arriving over USB to the moment the app sends it to the MPC Out port, then shows the average delay and the jitter. That covers the **Mac side only**. Not included:
- **Scarlett USB → DIN hop.** A DIN MIDI cable carries one note in about 1 ms, so four notes on the same step go out one after another, and the last arrives about 4 ms after the first.
- **The MPC's own reaction time.**

So trust your ears as well. Mark the test Pass only if it sounds tight.

## Bench tests

- **g2. MPC via Scarlett: notes.** Circuit T1–T4 play MPC tracks 1–4 on ch9–12, with nothing doubled.
- **g3. MPC follows Circuit tempo / start / stop via Scarlett.** The **Send test Start/Clock/Stop → MPC** button sends a short burst directly from the app.
- **i. Timing Circuit → app → Scarlett → MPC.**

## Switching back

If the MPC goes back on the thru box, choose **MIDI cable from thru box only**. The app then sends the MPC nothing, notes and clock included, and MPC tracks 1–4 listen on ch1–4.
