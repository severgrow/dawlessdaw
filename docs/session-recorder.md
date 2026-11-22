# Session Recorder

Local stereo capture from any browser audio input (ZED-10FX, Scarlett, SP-404MKII, or whatever the Mac exposes to Chrome). Takes stay in IndexedDB on this machine — **no upload**, **no AI** in the audio path, **no** device firmware or SysEx.

## How to try it

1. `npm run dev` → Chrome → **Sessions** tab (key `4`).
2. Allow microphone / audio capture when prompted.
3. Pick an input from the dropdown (every `getUserMedia` audioinput is listed; ZED / Scarlett / SP get label hints when the OS name matches).
4. Hit **Record**, make some sound, **Stop**. Trim with the waveform handles; export WAV (24-bit default) and/or MP3.
5. Optional: turn on **Follow Circuit Start/Stop** so MIDI Start/Stop from the Circuit arms record.

### ZED vs Scarlett bit depth

ZED over USB = **16-bit / 48 kHz max**. For 24-bit, connect the ZED’s main or Record outputs to the Scarlett inputs and pick the Scarlett in the dropdown.

## Capture path

- `getUserMedia` with echoCancellation / noiseSuppression / autoGainControl **off**, stereo, prefer 48 kHz.
- **AudioWorklet** raw PCM (not MediaRecorder).
- Graph: input → worklet (PCM + meters) only. Worklet outputs are silenced and only that silent path reaches `AudioContext.destination` so the node stays alive. **Monitor input** is **off** by default — turning it on taps the live mic to the speakers (headphones recommended). Monitoring is off so the room doesn’t feed back into the take.
- Chunks written to IndexedDB while recording; **Recover unsaved take** on reopen if a session was interrupted.

## Export

- WAV 16 / 24 / 32-float at the recorded sample rate; optional INFO tags (title, date, BPM).
- MP3 via in-browser encoder (see licence below).
- Trim / 10 ms fade / normalize apply to the export only — the stored take is never rewritten.

## MP3 encoder licence

MP3 export uses **[@breezystack/lamejs](https://github.com/breezystack/lamejs)** (LAME), **LGPL-3.0**. Encoding runs in a **Web Worker** on your machine. Upstream: [zhuker/lamejs](https://github.com/zhuker/lamejs).

## Honesty

Automated tests cover WAV headers, trim/fade maths, chunk stitch, and a sine→WAV level check. **Hardware record from ZED / Scarlett / SP is unverified** until you mark Bench **m. Record 30 s from ZED / Scarlett / any interface, trim, export, listen back** as Pass.
