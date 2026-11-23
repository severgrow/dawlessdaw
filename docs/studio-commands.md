# Studio commands

**Status:** experimental · software seam  
**Plan:** step 11  
**Module:** `apps/web/src/studio/commands.ts` (+ `commandsBind.ts`)

## Why

One small callable surface for UI today and hardware / assistant later — without rewriting engines.

## Commands

| Id | Behaviour |
|----|-----------|
| `panic` | All Notes Off / All Sound Off on assigned outs — **no SysEx** |
| `setRoute` | Upsert one `MidiRoute` by id |
| `setRoutes` | Replace route list |
| `enableRoute` | Toggle `enabled` on one route |
| `captureRecentBars` | Observation-only last N bars (1/2/4/8/16) |

`execute(id, args)` dispatches the same ops; unknown ids fail closed.

## Non-goals

- Does **not** enable app clock forwarding
- Does **not** send SysEx or flash firmware
- Capture stays observation-only (rolling MIDI buffer)

## Wiring

- Transport / Jam / Rig **Panic** → `getStudioCommands().panic()`
- Setup route enable → `enableRoute`
- Sessions **Capture last N bars** → `captureRecentBars`

## Checks

`npm test` · typecheck · build · smoke
