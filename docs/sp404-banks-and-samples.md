# SP-404MKII: Circuit tracks 1–4 → banks A–D, and sample prep

## Circuit tracks 1–4 play SP banks A–D

The SP-404MKII has two MIDI modes ([Roland: how are the MIDI notes mapped](https://support.roland.com/hc/en-us/articles/25793219901851-SP-404MK2-How-are-the-MIDI-notes-mapped)):

- **Mode A**: each bank A–J listens on its own MIDI channel (1–10); pads 1–16 = notes 36–51.
- Mode B: channel 1 = banks A–E, channel 2 = banks F–J.

In **Mode A**, Circuit tracks 1–4 (channels 1–4) match banks A–D one to one.

### Setup
1. On the SP: MIDI settings → **MIDI Mode A**.
2. Dawlessdaw: Settings → **Circuit tracks 1–4** → **SP banks A–D** (or **Both** to play the MPC as well).
3. Press **Learn pad 1** and play the note on Circuit track 1–4 that should hit pad 1. The 15 notes above it play pads 2–16. The default assumes the Circuit sends note 60 (offset −24), which is untested.
4. Run Bench Test h5.

### What gets sent
- Notes only, on the same channel (= bank), shifted by the offset.
- Knob CCs, Program Change and pitch bend are **not** sent to the SP. The SP reads CC 20–27 as DJ/Looper controls and Program Change as pattern select.

### Watch out
- The thru-box cable also sends every Circuit note to the SP. If the Circuit already sends notes 36–51 (learned offset 0), the cable alone plays the SP, and the app path would play every note twice. The app warns about this; choose **MPC** for tracks 1–4 in that case.
- In Mode A, the Section Bridge's SP pattern change on channel 13 won't work. Program Change selects patterns per bank channel.

## SP-404 Samples page (sample prep)

A simple editor for building banks A–D before they go onto the SP:

- 4 banks × 16 pads, labelled with the Circuit track that plays each bank.
- Drag audio files (WAV, AIFF, MP3) onto a pad; several files fill the following pads.
- Per pad: rename, trim start and end, normalise, preview, see the waveform.
- **Export** writes one 48 kHz, 16-bit WAV per pad, named `A01 kick.wav` style. Chrome asks which folder to save to (pick a folder on the SP's SD card, or anywhere); other browsers download the files one by one.
- Then import each file onto its pad on the SP.

It never reads or writes the SP's own project files, so it can't corrupt a project. Pads are kept in memory only, so export before closing the tab.

Code: `apps/web/src/sp404/samplePrep.ts` (tested helpers) and `apps/web/src/workspaces/SpSamplesWorkspace.tsx`.
