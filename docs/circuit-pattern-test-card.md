# SPLOT MIDI Brain hardware test card

## Capture and compare

1. Open **Setup → Ports**. Confirm **Circuit MIDI In** is assigned, then check that **Play → Live** shows **Ploe Live v1**. Leave the clock switches as you normally run them. Keep **Hear Circuit** and **Generative hardware controls** off for this first pass.
2. Start Circuit. On T1, play three notes with different velocities over two bars. Use the usual Note Tx setting. Open **Build → Pattern** and click **Capture last bar**. With steady Circuit clock, SPLOT takes the most recent completed bar. Choose **2** under Bars if you want to select between two bars. If the capture says **Estimated timing**, let Circuit clock settle and capture again.
3. Click **Use as Pattern**. Check that only T1 has notes and the captured velocities differ. Loading the grid should make no sound. Click **Undo** once to recover the previous grid, then **Redo** to bring the capture back.
4. Switch Circuit to a blank pattern while its clock keeps running. That gives SPLOT space to audition without Circuit also playing the same notes. Under **Variation B**, set a different pitch on a step, turn **Lock** on and click **Mutate**. Check that the locked pitch survives.
5. Choose **B · Variation** and press **Play** in SPLOT. Hear the edited phrase on the MPC. While it plays, choose **A · Original**. Playback stops. Press **Play** to hear the original phrase. Choose **B · Variation**, press **Play**, and hit **Undo** to compare the last edit. The SPLOT grid always edits B.

Extra hits that land on the same track and step are counted in the capture readout. SPLOT keeps the first hit in each cell and limits each gate to one sixteenth note. It captures the MIDI that Circuit sends.

## Five-minute checks

| Check | Action | Expected |
| --- | --- | --- |
| Hardware macros | Open **Generative hardware controls**, click **Enable mode**, select T1 on Circuit and turn Macro 3. Turn Macro 7 down below 40 and then up past 90. Repeat on T2. | Macro 3 adjusts Density. Macro 7 mutates once per sweep. The last action shows the correct track and CC. |
| Ordinary Controller | Click **Disable mode** and return to **Play → Live**. Play T1, T5 and T7, then use a macro with an existing device mapping. | T1 reaches MPC, T5 reaches Skiff and T7 reaches SP. The previously mapped macro works and the generator stays idle. |
| Euclidean rhythm | In **Build → Pattern → Euclidean rhythm**, choose T7, **5 hits**, **16 steps**, rotation **2**. Click **Apply to B**. Select B and press **Play**. | SP bank A plays five hits. Try rotation **3**, then Undo. A locked hit or rest keeps its place and the readout shows the resulting hit count. |
| Stop and Panic | While B plays a pitched sound, press **Stop**, then try **Panic** while playing again. | SPLOT stops scheduling notes and the sound releases. A queued note can finish its gate before playback resumes. A note that remains held is a bench failure. |

Physical hardware verification is pending.
