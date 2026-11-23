# Headless MIDI event recorder

**Status:** experimental · software-only  
**Package:** `@dawlessdaw/midi` → `MidiEventRecorder`  
**Plan:** MMT-8 Step 4 / implementation plan step 7

## What it is

A **push-only** ring buffer of timestamped MIDI events. Callers feed messages they already observed. It does **not**:

- send MIDI
- subscribe to `HardwareTransport`
- sit on the live routing path
- enable app clock forwarding
- require any UI

## Sources (no double-count)

| API | Meaning |
|-----|---------|
| `recordIncoming(message)` | Bytes seen on an input port |
| `recordOutbound(message, { routeId?, portId? })` | Bytes after a routed send |

Record each edge once. Do not also push the outbound echo as incoming.

## Captured kinds

Note on/off · CC · program change · pitch bend · aftertouch (pressure) · Start / Stop / Continue / song-position. Raw F8 clock ticks are **off by default** (`recordClockTicks: true` to opt in). Musical position attaches when you pass `getPosition` and a clock authority is known.

## Bounds

Default capacity **4096**; oldest events drop. `getDropped()` counts overflows.

## Honesty

`getSnapshot().honesty === 'experimental'` until Hardware Bench confirms.

## Related

Performance Memory / Circuit Intelligence stay higher-level musical logs. This recorder is the generic MIDI byte timeline under [capture last N bars](./capture-last-n-bars.md) (plan step 8).

## Checks

`npm test` · typecheck · build · smoke. No MMT-8 code/firmware/fixtures.
