# C — Top 15 realistic Dawlessdaw capabilities

Ranked by musical usefulness × feasibility × modular fit. Complexity: L / M / H.

| # | Capability | Usefulness | Feasibility | Complexity | Hardware relevance | Architecture fit |
|---|------------|------------|-------------|------------|--------------------|------------------|
| 1 | **Circuit Rhythm 8-track arranger adapter** (channel→role→multi-dest routes + Project PGM observe) | Very high | Confirmed docs | M | Critical | Optional device adapter |
| 2 | **Circuit Project PGM → Dawlessdaw Studio Scene recall** (mapping table) | High | Confirmed PGM Tx/Rx | L–M | Critical | Scenes already exist |
| 3 | **SP-404MKII stock EFX MIDI panel** (CC 16–19, 80–83) | High | Official chart | L | High | Device MIDI adapter |
| 4 | **Focus gesture classifier** (clock/sequencer vs CC/macro vs Project PGM) | High | Confirmed message kinds | M | All MIDI devices | Focus Engine extension |
| 5 | **MPC MIDI Learn mute profile** (export CC/note map for Track Mute) | High | Official Learn docs | M | High for approach C | Profile + docs; HW test |
| 6 | **FM1 Open CC reactive panel** | High | Documented Open map | M | High if Open flashed | Firmware-aware adapter |
| 7 | **Live port remap of sim Scene routes** | High | App-level | M | All | Runtime fix for Live gap |
| 8 | **Circuit pack/sample offline librarian** (SD layout) | Medium–high | Official SD docs | H | Prep kits | Librarian module |
| 9 | **SP pad note map → Focus + audition routes** | Medium–high | Official note map | L | Performance | Device adapter |
| 10 | **Clock authority UI presets** (Circuit vs MPC vs SP) | Medium | Already in router | L | Sync | Settings |
| 11 | **ZED USB stereo capture meter** (Web Audio) | Medium | Class-compliant | M | Monitoring | Audio-only path |
| 12 | **SP pattern PC send** (launch patterns remotely) | Medium | Official PC Rx | L | Arrangement | Adapter TX helper |
| 13 | **open404/Sparky read-only backup sidecar** | Medium | Community RE | H | Library | Isolated native/CLI |
| 14 | **MPC Plugin SDK companion instrument** (local audio UI only) | Low–medium for Dawlessdaw link | Confirmed SDK limits | H | On-device | **Cannot** talk project state to Dawlessdaw |
| 15 | **DOOM OS / Arrhythmia / MidiHax deep hooks** | Speculative | Custom FW | H | Niche | Out of core; high risk |

## Explicitly deferred

- Dawlessdaw companion that mirrors full MPC project state via Plugin SDK → **Unsupported** (no MIDI out from plugins).
- Live Scene index dump from Circuit without PGM/observe hacks → **Unsupported / HW test**.
- ZED motorised/digital mix control → **Unsupported**.
