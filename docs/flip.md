# FLIP — hardware loop capture lane

FLIP sits **under the 8 MIDI tracks** on the Sequencer workspace. Play hardware → capture a timed stereo loop → play / chop / export. Optional: mute selected **Dawlessdaw Pattern** tracks while the loop plays.

It is **not** a 9th Circuit MIDI track and **not** MIDI→audio conversion by itself. Circuit **USB audio** is unused — capture from Scarlett, ZED-10FX, or any browser audio input that hears your hardware mix.

Brand: **dawless/daw MIDI Brain**.

## How to actually flip (Mac)

1. `npm run dev` → Chrome → **Sequencer**. Allow microphone / audio input when prompted.
2. In **Setup**, assign Circuit MIDI as usual. Route MPC / SP / FM1 audio into Scarlett or ZED so the mix is audible on that interface.
3. In FLIP: pick that **Input**. Bars default **4**.
4. Press sequencer **PLAY** (Circuit clock or internal BPM), then **ARM** — FLIP waits for the next bar boundary, records, then **Ready**.
5. Press **PLAY LOOP** to hear the capture in the browser.
6. Optional: enable **Replace MIDI tracks while FLIP plays** and pick T1–T8 — those Dawlessdaw Pattern tracks mute for the loop (outbound sequencer notes stop). **UNDO MUTES** / STOP restores prior mute state.
7. Timing / export / reverse / fades live under **More / Advanced**.

Circuit-only MIDI with **no** Circuit audio into the interface will produce silence or room noise — FLIP cannot invent a stem from MIDI.

## What works today

| Capability | Status |
|------------|--------|
| Arm → bar-boundary capture → waveform → PLAY LOOP | **Yes** (Phase A) |
| Reverse / fades / CHOP / WAV export | **Yes** (Phase B) |
| Mute Dawlessdaw Pattern tracks while PLAY LOOP | **Yes** (minimal handoff) |
| Mute Circuit’s internal sequencer / hardware mute | **No** |
| Isolate one part from a stereo mix (“stem FLIP”) | **No** — never claimed |

## Reuse

| Piece | Source |
|-------|--------|
| AudioWorklet PCM + meters | Session Recorder `CaptureEngine` |
| IndexedDB takes / chunks | `recorder/takeStore` |
| WAV 16/24 | `recorder/wav` |
| Waveform peaks / trim maths | `recorder/pcmMath` |
| Transport / BPM / playhead | Sequencer engine (Circuit or internal) |
| Handoff mutes | Sequencer `setTrackMute` (Dawlessdaw-owned only) |

FLIP stores **takeId refs** in `localStorage` (`dawlessdaw.flip.v1`) — not giant PCM JSON blobs.

## State machine

`Idle → Armed → Waiting boundary → Recording → Processing → Ready`  
(+ Cancel / Error). Cancel works from active states.

## Feedback safety

- **Monitor** default **OFF** (under Advanced; same Session Recorder graph policy).
- Warn when software playback may re-enter the mix.
- **Play + Record** blocked unless **Intentional resample** (Advanced).

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

### Phase C — partial (minimal safe handoff)

- **Shipped:** “Replace MIDI tracks while FLIP plays” — mutes selected Dawlessdaw Pattern tracks for the duration of PLAY LOOP; STOP / UNDO MUTES restores prior mute flags. Stops outbound sequencer notes to Controller destinations for those tracks.
- **Not shipped / not claimed:** Circuit internal mute, hardware mute CC maps, fake stem isolation from a stereo mix.

### MIDI-guided FLIP (Milestone 5)

See [midi-guided-flip.md](./midi-guided-flip.md). Note-ons captured with audio → grid / MIDI / manual slice suggestions + onset refine; pack / SP WAV download / Samples. **No** MIDI playback from guidance; **no** SP serial write.

## Hardware checklist (owner)

| # | Check | Status |
|---|--------|--------|
| F1 | Scarlett input listed; ARM → 4-bar capture → Ready | **needs hardware** |
| F2 | ZED-10FX USB input (16-bit path) capture + listen | **needs hardware** |
| F3 | Capture Offset dial-in until loop feels on-grid | **needs hardware** |
| F4 | Monitor OFF: no feedback into take | **needs hardware** |
| F5 | Play loop while mix is dry / headphones | **needs hardware** |
| F6 | Export WAV 24 → DAW / SP IMPORT listen | **needs hardware** |
| F7 | Replace MIDI tracks: selected T* mute on PLAY LOOP, restore on STOP | **needs hardware** |

Automated tests cover durations, state machine, latency trim, persistence refs, handoff mute apply/restore, export headers, and a simulated capture→preview→chop→export path. Live interface capture remains **unverified** until this checklist is Pass.
