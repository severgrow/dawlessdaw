# Device connection

## Simulation

On first start, Dawlessdaw seeds mock ports and five studio members:

| Device | Mock ports | MIDI |
|--------|------------|------|
| Akai MPC One | mock-mpc-in / out | yes |
| Roland SP-404MKII | mock-sp404-in / out | yes |
| Novation Circuit Rhythm | mock-circuit-in / out | yes |
| M-VAVE FM1 | mock-fm1-in / out | yes |
| Allen & Heath ZED-10FX | — | **no** (audio-only member) |

Use **Replay groove fixture** or per-device **Tap note** to exercise routing and focus.

## Live (Web MIDI)

1. Switch to Live in the status bar.
2. Grant MIDI permission.
3. Ports are matched by name hints (see adapters). Unmatched ports become `generic-midi`.
4. ZED-10FX never appears as MIDI — register/ensure as audio-only studio member.

## Capability honesty

| Device | What Dawlessdaw claims |
|--------|--------------------|
| MPC One | Port I/O untested; MPC 3 remote **unavailable** |
| SP-404MKII stock | Notes/CC untested; pad remote **unavailable** |
| SP-404MKII DOOM | Experimental profile flag; DOOM features **unknown** |
| Circuit Rhythm | Track→role logical map; hardware Scene Sync **unavailable** |
| M-VAVE FM1 (**H-1** default) | **Unknown** until Bench Pass — treat as generic MIDI; community docs claim CC 20–23 (untested); deep CC/SysEx map **unavailable** (not Open) |
| ZED-10FX | USB audio only — **no** fake mixer MIDI |

## Profiles

SP-404 firmware profile (stock / doom) and FM1 profile (`h-1` / `stock` / `open` / `generic`) are adapter metadata — they do not invent control protocols.

### FM1 firmware lines (do not mix maps)

| Profile | What it is | Dawlessdaw stance |
|---------|------------|-------------------|
| **h-1** (this studio) | Community [jakehandy/h1](https://github.com/jakehandy/h1) | Default. Treat as **generic MIDI** until Bench Pass. Docs claim notes + CC 20–23 (+ CC 123) but every H-1 capability is **unknown/untested** here — no assumed map. |
| stock | Official M-VAVE line (e.g. V16) | Generic MIDI only here; vendor PDF not transcribed into fake CCs |
| open | Official [FM1 Open](https://github.com/m-vave/fm1_open) | Deep CC panel only if the unit actually runs Open — **not** this studio |
| generic | Unknown / unspecified | Notes/CC passthrough; no firmware claims |

**Never** apply Open V14 CC tables to an H-1 unit.
