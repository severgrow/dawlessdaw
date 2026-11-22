# B — Open-source / documentation inventory

| Resource | Device | Licence | Maturity | Use for Dawlessdaw | Notes |
|----------|--------|---------|----------|----------------|-------|
| [inmusic-software/mpc-plugin-builder-sdk](https://github.com/inmusic-software/mpc-plugin-builder-sdk) | MPC | MIT | Active (2026); host-sim + cross-compile | Future on-device instrument/effect plugins only | **Cannot send MIDI** to host; effects get no MIDI ([AGENTS.md](https://raw.githubusercontent.com/inmusic-software/mpc-plugin-builder-sdk/main/AGENTS.md)) |
| [inmusic-software/az0x-open-source](https://github.com/inmusic-software/az0x-open-source) | MPC Linux env | Various upstream (GPL/LGPL compliance dump) | Compliance archive | Environment reference only | **Not** MPC OS / sequencer / AIR engines |
| [Circuit Rhythm Programmer’s Reference Guide v5](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_programmer_s_reference_guide_v5_2.pdf) | Circuit Rhythm | Novation proprietary doc | Official | **Primary** CC/NRPN/PGM map for adapter | No SysEx section |
| [Circuit Rhythm User Guide — MIDI appendix](https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix) | Circuit Rhythm | Official | Stable | Channel map, Tx/Rx toggles, clock | Distinguishes Rhythm from Tracks |
| [Novation multi-Circuit sync KB](https://support.novationmusic.com/hc/en-gb/articles/24060538791570-Keeping-multiple-Circuit-Tracks-and-Circuit-Rhythm-s-in-sync) | Circuit Rhythm/Tracks | Official | Stable | Confirms Project PGM Tx 2.0.1+ | Instant vs queued PGM |
| [Novation SD pack layout](https://support.novationmusic.com/hc/en-gb/articles/4402771846930-Manually-setting-up-Circuit-Rhythm-SD-card-packs) | Circuit Rhythm | Official | Stable | Offline pack/sample librarian | `Rhythm/<n>_name/{PCM,Sessions,meta,GridFx}` |
| [FalseP0sitiv3/Circuit-Toolz](https://github.com/FalseP0sitiv3/Circuit-Toolz) | Circuit Rhythm packs | GPL-3.0 | New (2026-11) | Pack builder inspiration / offline tools | Browser local; uses CircuitGM templates (MPL-2.0) |
| [subsystem Circuit Rhythm MIDI defs](https://subsystem.co/supplemental/definitions/midi/instruments/novation/circuit_rhythm) | Circuit Rhythm | Derived from official docs | Traceable | Cross-check CC tables | SysEx “not recorded” in Novation docs |
| [Roland SP-404MK2 MIDI chart v5](https://static.roland.com/manuals/sp-404mk2_reference_v500/en-US/8010996378593163.html) | SP-404MKII | Official | Stable | Pad/EFX/PC/clock MIDI adapter | SysEx = **x** on MIDI |
| [iare-digital/open404](https://github.com/iare-digital/open404) | SP-404MKII USB | Check repo LICENSE | Early; PCAP-tested | Optional USB librarian sidecar | Reverse-engineered CDC-ACM; FW-sensitive |
| [TuscanPL/SparkyMK2](https://github.com/TuscanPL/SparkyMK2) | SP-404MKII | Check repo LICENSE | Usable day-to-day (author) | Librarian UX reference | Linux-first; FW 5.52 |
| [klangfeld-labs/doom-os](https://github.com/klangfeld-labs/doom-os) | SP-404MKII | Custom / proprietary base | Active community FW | **Do not depend** | Modified Roland firmware — high risk |
| [m-vave/fm1_open releases](https://github.com/m-vave/fm1_open/releases) | FM1 | Check release LICENSE | Official Open V14 (2026-10) | Deep FM1 path **only if Open is installed** | Different instrument personality vs stock / H-1 |
| [jakehandy/h1](https://github.com/jakehandy/h1) | FM1 | Check repo LICENSE | Community H-1 (2026) | **This studio’s firmware** — treat as generic MIDI until Bench Pass; docs claim CC 20–23 (unknown here) | Not M-VAVE official; not Open; do not invent or assume CC maps |
| [midi.guide FM1 community CCs](https://midi.guide/d/m-vave/fm1-community/) | FM1 Open | Community from maker docs | V14+ | Reactive panel **for Open only** | Must not be applied to H-1 |
| [MidiHax/fm1-midi-processor](https://github.com/MidiHax/fm1-midi-processor) | FM1 | Unofficial | Experimental | Out of scope for Dawlessdaw core | Replaces musical FW with MIDI processor |
| [Allen & Heath ZED-10FX User Guide AP7763](https://www.allen-heath.com/content/uploads/2023/06/AP7763_3-ZED10FX_UserGuide_A5.pdf) | ZED-10FX | Official | Stable | Audio capture / AUX plan | No MIDI |

## Licence caution

GPL tools (e.g. Circuit-Toolz) must not be copied into MIT/proprietary Dawlessdaw code without licence review. Prefer documenting formats and writing original parsers, or isolate GPL helpers as separate optional CLIs.
