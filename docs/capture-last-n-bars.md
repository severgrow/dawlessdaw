# Capture last N bars

**Status:** experimental · software-only  
**Plan:** step 8 / MMT-8 Step 5 proof  
**Package:** `@dawlessdaw/midi` → `RollingMidiCapture` + `extractLastNBars`

## What it does

Keeps a **rolling** MIDI event buffer (count + soft byte budget) fed by the headless [MidiEventRecorder](./midi-event-recorder.md). On request, returns the last **1 / 2 / 4 / 8 / 16** bars of observed events with:

- requested vs actual interval  
- tempo / clock context  
- sources (incoming vs outbound)  
- events  
- quality + limitations  

## Honesty

| Clock | Result |
|-------|--------|
| Confidence **High**, BPM known, musical position known | **Bar-aligned** window (4/4, 24 PPQN) |
| Anything weaker | **Wall-time** estimate; limitations say so |

Never sends MIDI, never changes routes, never enables app clock forwarding, never touches audio.

## UI

Sessions → soft mint **Capture last N bars** control (bar chips + one button). Passive bus listen only.

## Checks

`npm test` · typecheck · build · smoke. No MMT-8 code copy.
