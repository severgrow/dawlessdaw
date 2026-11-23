# MIDI-guided FLIP (Milestone 5)

**Honesty:** **experimental** until Patryk confirms on hardware. Captures MIDI note-ons **alongside** FLIP audio for slice suggestions only — **no MIDI playback**, **no stem claim**, **no SP serial write**. Original take PCM stays untouched.

## What it does

| Piece | Behaviour |
|-------|-----------|
| **MIDI capture** | Circuit note-ons during FLIP record → timeline events with Controller routing labels (context) |
| **Slice modes** | **Grid** / **MIDI-guided** / **Manual** |
| **Latency** | Timing Lab calibration if present for this input; else FLIP Capture Offset; else labelled estimate + user offset |
| **Refinement** | Nearby transient search, pre-margin, min length / fades — non-destructive |
| **Export** | Loop WAV, equal CHOP slices, guided slices, **pack** (files + JSON), SP-compatible 48 kHz/16-bit **download**, **→ Samples** pad store |
| **Existing FLIP** | Arm / play / reverse / fades / CHOP / handoff mutes unchanged |

## Where

Build → Splot pattern / Sequencer → **FLIP** lane (MIDI-guided slices panel when Ready).

## Hardware checklist (Patryk)

1. Sequencer PLAY + FLIP ARM with Scarlett/ZED hearing the mix; play Circuit notes during capture.
2. Ready → check MIDI-guided panel shows note count + labels (T* → device).
3. Toggle Grid / MIDI / Manual; Refine onsets; confirm dashed markers on waveform.
4. If Timing Lab calibration exists for that input, latency note should say Timing Lab; else estimate / offset.
5. Export Pack / Guided / SP WAV download — files land locally; Samples gets pads A01… — **no** SP serial.
6. Confirm existing EXPORT WAV / CHOP / PLAY LOOP still work.

## Limits

Not sample-accurate (browser MIDI + audio). Labels are routing hints, not isolated stems. SP path is download / SD IMPORT workflow only.
