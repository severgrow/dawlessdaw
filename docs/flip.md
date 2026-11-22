# FLIP — hardware loop capture lane

FLIP sits **under the 8 MIDI tracks** on the Sequencer workspace. Play hardware → capture a timed loop → flip / chop / play / export.

It is **not** a 9th Circuit MIDI track. Circuit **audio** is unused — capture from Scarlett, ZED-10FX, or any browser audio input.

Brand: **dawless/daw MIDI Brain**.

## How to try

1. `npm run dev` → Chrome → **Sequencer**.
2. Set BPM (or follow Circuit clock). Allow mic when prompted.
3. Pick an input (Scarlett / ZED / etc.). Default length **4 bars** (1 / 2 / 4 / 8).
4. **PLAY** the sequencer, then **ARM** — FLIP waits for the next bar boundary (step 0), records, then **Ready**.
5. Or **CAPTURE NOW** for an immediate unaligned take (labelled honestly).
6. Trim on the waveform, **PLAY LOOP**, optional Reverse / Fades / **CHOP** 4·8·16, **EXPORT WAV** 16/24.

Capture Offset (ms) is per input and applied as **non-destructive trim** — never silent time-stretch or pitch.

## Reuse

| Piece | Source |
|-------|--------|
| AudioWorklet PCM + meters | Session Recorder `CaptureEngine` |
| IndexedDB takes / chunks | `recorder/takeStore` |
| WAV 16/24 | `recorder/wav` |
| Waveform peaks / trim maths | `recorder/pcmMath` |
| Transport / BPM / playhead | Sequencer engine (Circuit or internal) |
| SP IMPORT (optional later) | Existing Sessions export pipeline |

FLIP stores **takeId refs** in `localStorage` (`dawlessdaw.flip.v1`) — not giant PCM JSON blobs.

## State machine

`Idle → Armed → Waiting boundary → Recording → Processing → Ready`  
(+ Cancel / Error). Cancel works from active states.

## Feedback safety

- **Monitor** default **OFF** (same Session Recorder graph policy).
- Warn when software playback may re-enter the mix.
- **Play + Record** blocked unless **Adv. resample** (intentional).

## Timing honesty

| Label | Meaning |
|-------|---------|
| **aligned** | Started on a bar boundary; still subject to browser audio/MIDI path latency |
| **offset_applied** | Capture Offset trim applied |
| **unaligned** | Free capture — **no** time-stretch to fake grid lock |
| confidence **high / medium / low / none** | Honest about Circuit vs internal clock and calibration |

Web MIDI and `getUserMedia` run on the browser main thread / audio path — **not sample-accurate**. Prefer hardware DIN thru for tight multi-device sync. See also [sequencer.md](./sequencer.md) and [limitations.md](./limitations.md).

## Phase status

### Phase A — shipped

Lane UI, input select, 1/2/4/8 bar capture (default 4), state machine, quantised start + confidence + Capture Offset, pre/post-roll trim, waveform, loop play/stop/gain, trim, WAV 16/24, session save/restore (refs), feedback-safe defaults.

### Phase B — shipped (compact)

Reverse, fades, CHOP 4/8/16 equal slices, compact 16-step slice pad row (mono/choke flag), undo stack for clip edits.

### Phase C — design only (not implemented)

- **No** unverified Circuit mute / stem APIs.
- **No** fake stem isolation from a stereo mix.
- Possible future: user-owned mute maps if hardware-proven; explicit “mix dump” labelling only.

## Hardware checklist (owner)

| # | Check | Status |
|---|--------|--------|
| F1 | Scarlett input listed; ARM → 4-bar capture → Ready | **needs hardware** |
| F2 | ZED-10FX USB input (16-bit path) capture + listen | **needs hardware** |
| F3 | Capture Offset dial-in until loop feels on-grid | **needs hardware** |
| F4 | Monitor OFF: no feedback into take | **needs hardware** |
| F5 | Play loop while mix is dry / headphones | **needs hardware** |
| F6 | Export WAV 24 → DAW / SP IMPORT listen | **needs hardware** |

Automated tests cover durations, state machine, latency trim, persistence refs, export headers, and a simulated capture→preview→chop→export path. Live interface capture remains **unverified** until this checklist is Pass.
