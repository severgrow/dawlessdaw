# E — Reactive UI event map

What can realistically change NervOS active context.  
**Direct** = hardware transmits observable MIDI · **Inferred** = soft heuristics · **Unavailable** = not transmitted.

| Gesture / event | MPC One | SP-404MKII stock | Circuit Rhythm | FM1 (Open preferred) |
|-----------------|---------|------------------|----------------|----------------------|
| Pad press | Direct (notes out if port sends) — **HW test** | Direct notes (modes A/B) — chart Confirmed RX; TX **HW test** | Direct notes on track ch / global ch16 table | Direct notes — **HW test** |
| Knob / macro | Direct if CC TX — **HW test** | EFX Ctrl CC 16–19, 80–83 — chart O for TX | Macro CC 21–28 etc. — Confirmed map; TX when CC Tx on — **HW test** | Track CCs — Open map Confirmed RX; TX **HW test** |
| Button (mute/transport UI) | Transport Learn **Unsupported**; mute via Learn **Plausible** | DJ/Looper button CCs in chart (mode-specific) | Mute button: no dedicated CC in PRG — **Unavailable / HW test** | Firmware-specific — **HW test** |
| Track selection | Unavailable as standard MIDI | N/A | Unavailable as MIDI | Track role pages — **HW test** |
| Pattern change | Sequence change not standard MIDI | PC Rx Confirmed; TX **x** on chart | Pattern UI: no PC in PRG for patterns — **Unavailable** | Project/pattern FW-specific |
| Scene / section change | N/A (sequences) | Pattern PC Rx | **Scene**: no MIDI in PRG; **Project**: PGM ch16 Confirmed | Program/SysEx Open — partial |
| Program change | Plugin/program — **HW test** | Pattern bank PC Rx | Project PGM ch16 Confirmed Tx/Rx | Open program SysEx — doc’d |
| Effect parameter | Learn / plugin CC | EFX CCs Confirmed | FX CCs/NRPNs Confirmed | Engine CCs Confirmed (Open) |
| Transport | Clock/start/stop if sync out; MMC for Learn gap | Clock O when sync out | Clock + start/stop Confirmed | Open lists start/stop SysEx — verify |
| Internal sequencer playback | Notes may TX — **HW test**; indistinguishable from pads without timing heuristics | Pattern notes — **HW test** | Sequencer notes on track channels when Note Tx on — Confirmed category; vs pads **Inferred** | Sequencer vs keys — **Inferred** |

## Focus Engine policy (recommended)

Already true in v0.1: **clock never changes focus**.

Extend (PoC):

| Class | Examples | Focus weight |
|-------|----------|--------------|
| `background` | clock, song position | Ignore |
| `sequencer-stream` | dense note-ons on same channel | Soft / Smart threshold only |
| `performer-gesture` | sparse notes, macros CC 21–28, level/pan | Strong Follow candidate |
| `arrangement` | ch16 Project PGM | Context event → optional Scene recall; do not thrash device focus |

Do **not** claim NervOS detects touches the hardware does not transmit.
