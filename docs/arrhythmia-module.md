# Arrhythmia module — design only

**No firmware install. No SysEx. No flashing.** This note describes how Splot could *optionally* talk to a community Arrhythmia (or similar MIT-licensed) Circuit Rhythm custom firmware **if** the owner later chooses to install it themselves.

Arrhythmia / Rhythm Plus / Circuit Remix are MIT projects; GPL references stay out of product code. Device behaviour still lives under `packages/devices` profiles.

## Goal

If stock MIDI cannot expose unsaved pattern RAM or richer mute / scene state, a custom-FW lane could add **opt-in** capabilities behind the existing experimental Deep Sync gate — without changing the default stock path.

## Non-goals

- Splot will not download, flash, or recommend a specific FW build as required.
- Splot will not write device storage or stop transport unless the user confirms (same rule as stock USB file protocol).
- Stock users must keep full Circuit Phase 2 value (checklist, ticks, projects, sections, local `.ncs`).

## Proposed capability matrix (design)

| Capability | Stock | Arrhythmia (hypothetical) | Splot UI |
|------------|-------|---------------------------|----------|
| Note / CC / PC / Clock observe | Yes (PRG v5) | Yes | Circuit ticks + Intelligence |
| Live unsaved pattern dump | Unsupported | Maybe (custom SysEx) | Deep Sync lane only; honesty = experimental |
| Explicit mute state TX | Unknown / inferred | Maybe | Never auto-mute; show confirmed vs inferred |
| Scene change MIDI | Unavailable in PRG | Maybe | Informational only until bench Pass |
| Project grid 1–64 | PC ch16 | Same | Already Phase 2 |

## Integration sketch

1. Identity probe already exists in Circuit Deep Sync (`queryCustomFirmware`) — safe, read-oriented.
2. If a known Arrhythmia marker appears, unlock an **Arrhythmia** sub-panel under experimental tools.
3. Every custom message stays behind confirm + honesty badges.
4. Profiles: `packages/devices` gains an `arrhythmia` honesty flag; stock profile unchanged.

## Decision

Ship Phase 2 on **stock** MIDI only. Revisit Arrhythmia only if Patryk installs custom FW and asks for a probe lane. Until then this file is documentation — not a product feature.
