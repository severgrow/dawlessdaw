# SP-404MKII: Circuit tracks 1–4 → banks A–D, and sample prep

## Circuit tracks 1–4 play SP banks A–D

The SP-404MKII has two MIDI modes ([Roland: how are the MIDI notes mapped](https://support.roland.com/hc/en-us/articles/25793219901851-SP-404MK2-How-are-the-MIDI-notes-mapped)):

- **Mode A**: each bank A–J listens on its own MIDI channel (1–10); pads 1–16 = notes 36–51.
- Mode B: channel 1 = banks A–E, channel 2 = banks F–J.

In **Mode A**, Circuit tracks 1–4 (channels 1–4) match banks A–D one to one.

### Setup
1. On the SP: MIDI settings → **MIDI Mode A**.
2. Dawlessdaw **Controller** tab: preset **My Studio · T1–4 → SP** (T1–T4 → SP banks A–D). Use **My Studio · T1–4 → MPC** when those tracks should play the MPC instead.
3. On track 1, press **Play the first note** and play the note on Circuit track 1 that should hit pad 1. The 15 notes above it play pads 2–16. The default assumes the Circuit sends note 60 (pad 1 = 36 → shift −24), which is untested.
4. Run Bench Test h5.
5. Optional: map Circuit macros to **Effect control 1–8** (Roland CCs 16–19, 80–83) and run bench **h6** to learn which on-screen CTRL each CC moves. Effect on/off is not offered yet.

### What gets sent
- Notes on the bank channel, shifted by the learned first-note map.
- Knob CCs only if you map them (effect CTRL targets or Custom CC in Advanced).
- Unmapped Program Change / CC from the Circuit are **dropped**.

### Watch out
- The thru-box cable also sends every Circuit note to the SP. If the Circuit already sends notes 36–51 (learned offset 0), the cable alone plays the SP, and the app path would play every note twice. The app warns about this; choose **MPC** for tracks 1–4 in that case.
- In Mode A, the Section Bridge's SP pattern change on channel 13 won't work. Program Change selects patterns per bank channel.

## Samples tab (sample prep)

A pad editor for building SP banks before they go onto the SP:

- All 10 banks (A–J) × 16 pads. Each bank shows which Circuit track plays it (from the Controller preset).
- Drag audio files (WAV, AIFF, MP3, FLAC) onto a pad; several files fill the following pads. Double-click an empty pad to pick files.
- Drag a pad onto another pad to move it (swaps if both are full). Arrow keys move around, Space plays.
- Per pad: name, trim start and end (the waveform dims the cut parts), normalise, play.
- **Pads are kept in this browser** (IndexedDB) and come back after a reload. They stay on this Mac only.
- **Save bank** or **Save all** writes one 48 kHz, 16-bit WAV per pad, named like `A01 kick.wav`. Chrome asks which folder to save to; other browsers download the files one by one.
- Then put them on the SP: copy them to the SD card and use the SP's Import (Roland SP-404MKII Reference Manual, "Importing samples"), or drag them onto pads in Roland's SP-404MKII App.

### See which pads are already on the SP (SD card)

Stock USB is **audio + MIDI only** — there is no mass-storage mount of the live library, and no Web MIDI pad dump.

To list occupied pads in Chrome:

1. On the SP: **SHIFT + pad 14 → EXPORT to SD-CARD → PROJECT** (exports `EXPORT/PROJECT/PROJECT_xx/` with `PADCONF.BIN` + `SMPL/BANK*-*.SMP`).
2. Eject the SD card and put it in a **Mac card reader** (Finder shows `IMPORT` / `EXPORT` / `BKUP`).
3. Samples tab → **Open SP volume…** → grant the SD volume (or a single `PROJECT_*` folder).
4. **Refresh** after you re-export.

What you get:

| Visible | Not visible |
|---------|-------------|
| Occupied vs empty for A01–J16 from `PADCONF.BIN` / `SMPL/` | Live pads over USB without exporting |
| Pad names from `PADCONF.BIN` | Full-system `BKUP/*.bin` contents |
| `.SMP` filename + length/channels from RFWV header when present | Reliable audio preview / play-from-card |
| Import-staged `IMPORT/PROJECT_*` kits the same way | Writing or changing anything on the card |

Read-only File System Access only. USB cable alone will not expose the library.

## Sessions → Export WAV → SP pad

From the Sessions recorder, **Export WAV → SP pad** writes the trimmed take straight into a mounted SD card’s `IMPORT/` as `A01 name.wav` (48 kHz / 16-bit). Reuses the same File System Access volume picker id as Samples (`dawlessdaw-sp404-sd`). Pads do **not** load until you run **SHIFT + pad 14 Import** on the unit. No SysEx; USB cable alone cannot receive the file.

Code: `apps/web/src/sp404/samplePrep.ts` (tested helpers), `apps/web/src/sp404/padStore.ts` (browser storage), `apps/web/src/sp404/sdPadScan.ts` / `sdVolume.ts` (SD project scan), `apps/web/src/sp404/spImportPath.ts` / `spVolumeHandle.ts` (IMPORT write), `apps/web/src/workspaces/SamplesWorkspace.tsx`, and `apps/web/src/workspaces/SessionsWorkspace.tsx`.

