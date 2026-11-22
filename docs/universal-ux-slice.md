# Universal UX slice (PR1) — implemented vs planned

Scoped pass from the Universal Hardware + UI/UX philosophy. **Not** the full manifesto.

## Implemented in this PR

| Area | What landed |
|------|-------------|
| **Reliability** | Plain connection / empty-port copy; clock hints without `receive-*` jargon; equal-score ports stay unbound (ambiguous → Assign); onboarding banner Connect→Identify→Assign→Play |
| **Generic MIDI schema** | Versioned `GenericDeviceProfile` (`schemaVersion: 1`) in `@dawlessdaw/devices` — honesty **generic / documented / verified**, category, colour, channel, remembered port names, optional user controls |
| **Unknown-device onboarding** | Setup → Unknown devices: detect free ports → name / category / colour / channel / I/O → persist `localStorage` (`dawlessdaw.customProfiles.v1`) → restore by port name on reconnect |
| **MIDI Learn** | Per user-added control only; Cancel clears listen state; glass Cancel restores Controller baseline (existing) |
| **No fake controls** | New Generic profiles ship with **zero** knobs; Learn never invents a factory map |
| **Usability** | Rig = clearer home (read-only routing, note activity without clock tick spam); Controller/Learn plain language; Advanced still shows MIDI numbers |
| **Import / export** | JSON bundle with rigorous validation (no code execution); local file only |
| **Tests** | Schema, import/export, ambiguous ports, reconnect-by-name, mapping persistence, Learn helpers / cancel |

## Explicitly out of scope (planned later)

- Visual brand redesign / animation libraries
- Circuit beyond 8 tracks
- Session Recorder capture-graph work
- SP SD parser depth
- MPC Scarlett transport changes (unless a regression we introduce)
- Community / AI / cloud marketplace for profiles (schema comment only)
- Auto-merge of this PR — **ask owner first**

## Honesty badges

| Tier | Meaning |
|------|---------|
| **Generic** | MIDI notes/CCs only; no claimed parameter map |
| **Documented** | From a manual or reference; live Pass still pending |
| **Verified** | Owner confirmed on hardware (Bench Pass) |

Built-in studio devices keep their existing capability statuses; none are Verified until the owner marks Pass.

## Hardware

**Untested** from this cloud agent. Owner Pass required before claiming live behaviour.

## Protect (do not regress)

Circuit Controller, MIDI Learn glass, Sessions recorder, SP samples, MPC transport, Bench, My Studio channel maps.
