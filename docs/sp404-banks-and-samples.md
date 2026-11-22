# SP-404MKII: Circuit tracks 1–4 → banks A–D, and sample prep

## Circuit tracks 1–4 play SP banks A–D

The SP-404MKII has two MIDI modes ([Roland: how are the MIDI notes mapped](https://support.roland.com/hc/en-us/articles/25793219901851-SP-404MK2-How-are-the-MIDI-notes-mapped)):

- **Mode A**: each bank A–J listens on its own MIDI channel (1–10); pads 1–16 = notes 36–51.
- Mode B: channel 1 = banks A–E, channel 2 = banks F–J.

In **Mode A**, Circuit tracks 1–4 (channels 1–4) match banks A–D one to one.

### Setup
1. On the SP: MIDI settings → **MIDI Mode A**.
2. Dawlessdaw **Rig tab**: preset **SP + FM1** (T1–T4 → SP banks A–D), **MPC & SP + FM1** to play the MPC as well, or send any track to any bank yourself.
3. In the Rig tab's **SP pads** box, press **Learn pad 1** and play the note on Circuit track 1–4 that should hit pad 1. The 15 notes above it play pads 2–16. The default assumes the Circuit sends note 60 (offset −24), which is untested.
4. Run Bench Test h5.

### What gets sent
- Notes only, on the same channel (= bank), shifted by the offset.
- Knob CCs, Program Change and pitch bend are **not** sent to the SP. The SP reads CC 20–27 as DJ/Looper controls and Program Change as pattern select.

### Watch out
- The thru-box cable also sends every Circuit note to the SP. If the Circuit already sends notes 36–51 (learned offset 0), the cable alone plays the SP, and the app path would play every note twice. The app warns about this; choose **MPC** for tracks 1–4 in that case.
- In Mode A, the Section Bridge's SP pattern change on channel 13 won't work. Program Change selects patterns per bank channel.

## Samples tab (sample prep)

A pad editor for building SP banks before they go onto the SP:

- All 10 banks (A–J) × 16 pads. Each bank shows which Circuit track plays it (from the Rig tab).
- Drag audio files (WAV, AIFF, MP3, FLAC) onto a pad; several files fill the following pads. Double-click an empty pad to pick files.
- Drag a pad onto another pad to move it (swaps if both are full). Arrow keys move around, Space plays.
- Per pad: name, trim start and end (the waveform dims the cut parts), normalise, play.
- **Pads are kept in this browser** (IndexedDB) and come back after a reload. They stay on this Mac only.
- **Save bank** or **Save all** writes one 48 kHz, 16-bit WAV per pad, named like `A01 kick.wav`. Chrome asks which folder to save to; other browsers download the files one by one.
- Then put them on the SP: copy them to the SD card and use the SP's Import (Roland SP-404MKII Reference Manual, "Importing samples"), or drag them onto pads in Roland's SP-404MKII App. The exact on-device import steps aren't written here yet because Roland's site wasn't reachable when this was written.

It never reads or writes the SP's own project files and never talks to the SP, so it can't corrupt a project.

Code: `apps/web/src/sp404/samplePrep.ts` (tested helpers), `apps/web/src/sp404/padStore.ts` (browser storage) and `apps/web/src/workspaces/SamplesWorkspace.tsx`.
