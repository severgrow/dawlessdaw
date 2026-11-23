# A5 journey smoke

**Status:** experimental · software-only  
**Plan:** step 6  
**Test:** `apps/web/src/studio/a5-journey-smoke.test.ts`

## Journey (headless)

`connect → route → play → capture → save → reopen`

Uses Vitest + `MockMidiTransport` + `StudioCommands` + injected `ClockService`. No real hardware.

| Step | How |
|------|-----|
| Connect | Mock ports start / list |
| Route | `setRoute` with `forwardClock: false` |
| Play | Inject Start + notes; assert remapped outbound |
| Capture | `captureRecentBars` via rolling buffer + injected clock |
| Save / reopen | `exportSessionJson` / `importSessionJson` round-trip |
| Panic | CC 120/123 only — **no SysEx** |
| Extra | Light take recovery stitch; built-in mic filter |

## Guarantees

- App clock forwarding stays off on note routes
- No SysEx
- No MacBook / iPhone / Continuity mic as selectable input

## Checks

`npm test` · typecheck · build · smoke
