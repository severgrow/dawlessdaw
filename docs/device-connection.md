# Device connection

## Simulation

On first start, NervOS seeds mock ports and five studio members:

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

| Device | What NervOS claims |
|--------|--------------------|
| MPC One | Port I/O untested; MPC 3 remote **unavailable** |
| SP-404MKII stock | Notes/CC untested; pad remote **unavailable** |
| SP-404MKII DOOM | Experimental profile flag; DOOM features **unknown** |
| Circuit Rhythm | Track→role logical map; hardware Scene Sync **unavailable** |
| M-VAVE FM1 | Generic MIDI untested; firmware map **experimental** |
| ZED-10FX | USB audio only — **no** fake mixer MIDI |

## Profiles

SP-404 firmware profile (stock / doom) and FM1 mode (generic / firmware-aware) are adapter metadata — they do not invent control protocols.
