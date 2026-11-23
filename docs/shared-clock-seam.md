# Shared clock interface (ClockService)

**Status:** experimental · software seam  
**Plan:** step 10  
**Package:** `@dawlessdaw/sequencer` → `ClockService`, `adaptClockService`, `createInjectedClockService`

## Why

Clock Health, musical position, Capture last N bars, and Transport BPM all need the same musical-time authority. This seam is a **thin adapter** — existing monitors keep their behaviour.

## Contract

| Method | Role |
|--------|------|
| `now()` | Wall / performance ms (injectable in tests) |
| `getMusicalTime()` | bar / beat / tickCount / transport |
| `getQuality()` | confidence, status, BPM, clockDetected |
| `getHealthSnapshot()` | Full Timing Lab snapshot when adapted |
| `appClockForwarding` | Always **`false`** — never turns on route clock forward |

## Wiring

- **Studio:** `StudioRuntime.getClockService()` adapts Circuit Intelligence position + Clock Health
- **Capture last N:** host builds capture hints via `captureHintFromClockService`
- **Transport BPM:** `circuitTempoViewFromClock(svc)`
- **Timing Lab:** reads health through the same service

## Tests

`createInjectedClockService` — deterministic BPM / position without Web MIDI.

## Non-goals

No change to `forwardClock === true` opt-in. No MMT-8 copy. No compulsory UI.
