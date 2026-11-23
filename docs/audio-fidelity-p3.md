# Audio fidelity P3 — capture buffering

**Status:** stacked PR · **do not merge** until Patryk asks  
**Base:** main after #76

## What changed

Session Recorder Worklet messages still land on the main thread for meters + RAM chunks. IndexedDB writes now go through `CapturePersistBuffer`:

- Batch size / interval flush (`appendChunksBatch` — one transaction)
- Soft-drop oldest **pending persist** jobs under backlog; **RAM take stays complete**
- `CaptureStatus.buffer` exposes worklet message count, frames, drops, approx RAM, msgs/s, persist chunk rate

## Explicit non-goals

- No SharedArrayBuffer
- No Worklet → IDB from the audio thread
- No UI redesign

## Verify

`npm test` · `npm run typecheck` · `npm run build`
