# Instrument schema draft (plan step 13)

**Status:** schema only · stacked PR · **do not merge** until Patryk asks  
**Package:** `@dawlessdaw/devices` → `instrument-schema.ts`  
**Version:** `INSTRUMENT_SCHEMA_VERSION = 1`

## Goal

Additive **Universal Instrument** model (Phase B3): MIDI ± audio, multi-port, Zynthian-inspired **chains** — without breaking live routing or renaming package / localStorage keys.

## What this is

| Piece | Role |
|-------|------|
| `Instrument` | One musical object: identity, honesty, MIDI ports, optional audio ports, provenance |
| `InstrumentChain` | Ordered stages (`source` → `fx` → `destination` / `monitor`) |
| `InstrumentBundle` | Export/import JSON (`kind: splot-instruments`) |
| Adapters | Project **from** `DEVICE_PROFILES`, `GenericDeviceProfile`, `MY_STUDIO_ROLES` |

## What this is not

- Not a replacement for `MidiRoute`, Controller presets, or StudioSetup JSON
- Does **not** enable clock forward (chains never imply `forwardClock`)
- Does **not** send SysEx or change storage keys (`dawlessdaw.*` unchanged)
- Does **not** copy Zynthian GPL code — chain idea is **REIMPLEMENT** only
- Does **not** auto-select built-in Mac/iPhone mics (pickers still filter)

## Migration path (careful)

1. **Now:** read-only projections (`projectBuiltinInstruments`, `instrumentFromGenericProfile`, …).
2. **Later:** optional dual-write / UI that edits Instruments while still compiling to existing routes.
3. **Never in this PR:** rewrite `dawlessdaw.customProfiles.v1`, studio setup, or controller preset keys.

Provenance fields (`deviceProfileKey`, `genericProfileId`, `studioRoleId`, …) keep a breadcrumb back to today’s models.

## Honesty

| Value | Meaning |
|-------|---------|
| `builtin` | Shipped studio / DEVICE_PROFILES projection |
| `generic` / `documented` / `verified` | Same tiers as GenericDeviceProfile |

## Next steps (not this PR)

- Step 14: AudioBackend contract + fake backend  
- Step 15: Mixer data model (buses referenced by `audioBus` on stages)  
- Runtime: compile chain → MidiRoute without changing clock defaults  

## Tests

`packages/devices/src/instrument-schema.test.ts` — project, parse, bundle, no clock-forward implication.
