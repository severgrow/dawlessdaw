# Next steps (after v0.1)

Priorities refined by the hardware feasibility pass (`docs/hardware-integration/development-priorities.md`):

1. **Live bench** — Circuit mute/Note Tx, Project PGM Tx, USB remaps (1–4→MPC 9–12, 6→SP 13), thru-box clock-without-notes check; mark capabilities verified.
2. **SP-404MKII stock EFX MIDI panel** — official CC chart; no USB write ops in core.
3. **MPC MIDI Learn mute pack** — CC 20 on control **ch15**; hardware-test before claiming.
4. **FM1** — this studio runs **H-1**; treat as generic MIDI until Bench Pass (every H-1 capability unknown). Optional later: Open V14+ reactive panel only if Open is flashed (do not assume Open CCs on H-1).
5. **Live port rebind** — map sim Scenes onto real Web MIDI port IDs.
6. **ZED Web Audio meter** — capture only.
7. **Optional librarians** — Circuit SD pack builder (original code); open404/Sparky read-only sidecar.
8. **NativeBridgeTransport / SQLite / Playwright** — as before; Plugin SDK only for on-device audio plugins (no Dawlessdaw IPC).
