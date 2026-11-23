# AudioBackend contract + fake backend (plan step 14)

**Status:** contract + fake + Worklet seam · stacked PR · **do not merge** until Patryk asks  
**Package:** `@dawlessdaw/audio`  
**Inspiration:** Cross/Nota swappable backend / FakeAsioDriver — **REIMPLEMENT** only (never copy AGPL)

## Goal

One swappable **AudioBackend** interface so headless tests can run without getUserMedia, while browser **AudioWorklet** remains a first-class backend. Production Sessions/FLIP capture stays in `CaptureEngine` (thin seam — no rewrite of take persistence or monitor graph).

## Backends

| Kind | Class | Role |
|------|--------|------|
| `worklet` | `WorkletAudioBackend` | Browser AudioWorklet-facing; host injects enumerate/startCapture |
| `fake` | `FakeAudioBackend` | Deterministic Vitest backend; optional timed PCM |
| `native-bridge` | (factory rejects) | Reserved — same story as MIDI NativeBridge stub |

`MemoryWorkletHost` is a test double for Worklet wiring without a browser.

## Mic policy (unchanged)

- `isBuiltInOrPhoneMic` / `filterSelectableAudioInputs` live in `@dawlessdaw/audio`
- Apps pickers re-export from `apps/web/src/recorder/devices.ts`
- **Never** auto-select MacBook / iPhone / Continuity / `default` / `communications`
- `open()` refuses built-ins; empty picker → “Plug in an interface”

## What this is not

- Not a rewrite of CaptureEngine, InputPreviewEngine, or FLIP monitor wiring
- Does **not** change clock-default or SysEx behaviour
- Does **not** vend Nota/Cross sources

## Snapshot

`backend.snapshot()` returns an immutable view (`kind`, open device, sampleRate, monitorInput, inputCount) for tests / future graph checks.

## Next (not this PR)

- Optional: adapt CaptureEngine as a `WorkletAudioHost`
- Step 15: Mixer data model
- Native desktop audio host when contracts freeze

## Verify

```bash
npm test
npm run typecheck
npm run build
npm run smoke
```
