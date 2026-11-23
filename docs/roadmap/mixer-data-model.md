# Mixer data model (plan step 15)

**Status:** schema only · stacked PR · **do not merge** until Patryk asks  
**Package:** `@dawlessdaw/audio` → `mixer-model.ts`  
**Version:** `MIXER_SCHEMA_VERSION = 1`  
**Kind:** `splot-mixer`

## Goal

Logical **levels / mute / solo / buses** model for future StudioRuntime / mix scenes (Phase E). MIXTEE topology and Zynthian strip ideas are **REFERENCE / REIMPLEMENT** only.

## What this is

| Piece | Role |
|-------|------|
| `MixerChannelStrip` | level, pan, mute, solo → `busId` |
| `MixerBus` | main / aux / group / cue master + mute |
| `MixerGraph` | versioned export shape (`splot-mixer`) |
| `resolveMixerAudibility` | pure mute / exclusive-solo / bus-mute rules |
| `parseMixerGraph` / `validateMixerGraph` | round-trip + guards |

Empty default = **Main + Cue**, zero channels — no invented 16×8 layout.

Instrument chain stages may set `audioBus` to a `MixerBusId` (link only).

## What this is not

- **Not** a MIXTEE / multichannel hardware product claim
- **Not** ZED MIDI mixer control or Circuit Mixer CC runtime
- **Not** a shipping mixer UI
- Does **not** change MidiRoute, CaptureEngine, clock defaults, or SysEx
- Does **not** rename localStorage keys

## Honesty

Prefer `createEmptyMixerGraph()` until real strips exist. `createDemoMixerGraph()` is for Vitest/docs only — three named strips, not a product SKU.

## Next (not this PR)

- Optional UI that edits `MixerGraph` without claiming hardware channel counts
- Wire resolved levels into a future audio graph host
- Mix scenes / snapshots (Phase E5)

## Verify

```bash
npm test
npm run typecheck
npm run build
npm run smoke
```
