# Circuit live bench

Use the stock Ploe Live v1 preset or route the following three tracks in Play → Live. Confirm the actual port, channel and note with **Check route** on each track.

| Circuit lane | Destination | What to play |
| --- | --- | --- |
| T1 | MPC track 1, MIDI channel 9 | A kick on beat one and a second hit on beat three |
| T5 | FM1 track 1, MIDI channel 1 | A bass note with audible sustain through most of bar four |
| T7 | SP‑404MKII bank A, MIDI channel 1 | A hat slightly late in the bar |

1. Set Circuit to 110 BPM. Turn on Clock Tx and Note Tx. In Setup → Tests, click **Reset timing**. Start an audio recording of the mixer output if available.
2. In Play → Live, press Play on Circuit and check that the three **IN** and **OUT** indicators flash on the intended lanes. Listen for the expected sounds. Keep it playing until bar five starts.
3. Select **4 bars** and click **Capture take**. Stop Circuit, then click **Loop take**. Listen through the wrap. Expect one kick on the downbeat, the same late hat, and a bass release before the next phrase. The transport should say **SPLOT · Looping**.
4. Switch to Rig and back during the loop. Stop the loop and listen for held notes. Start it again, unplug a destination, and check that playback stops. After reconnecting, check the route before restarting. If a disconnected device still sounds, stop the sound on the device or use Panic after it reconnects.
5. In Setup → Tests, click **Export results**. The report keeps input and send timestamps plus the worst note-on delay for live and loop playback since the last reset. Live delay is measured from the incoming MIDI timestamp to the app's output handoff. Loop delay is measured against the scheduled send time. Use the mixer recording to hear when the devices actually sound.

The software rehearsal runs the same app with simulated Web MIDI inputs and outputs. Run `npm run build:desktop` and `node scripts/circuit-live-bench.mjs` with Playwright Chromium installed.

## Parts and Tracks preview

In Live, give the take a name and select **Keep as Part**. Open Song, cue a bar and place the Part. Add a second linked placement and one independent copy, then rename the Part or replace it with a fresh take. The linked placements update together. Confirm the independent copy still plays as saved and try Undo. Use **Song backup** to retain the whole arrangement and its Part links.

For Circuit Tracks, open **Setup → Tests → Circuit Tracks MIDI preview** and select the input. Play each synth, each MIDI lane and each drum in turn. Capture the individual drum pitches in **Export results** so a later build can validate a per-drum map against real input. The preview uses factory channels and groups drums on channel 10.
