# Next steps (after v0.1)

Priorities refined by the hardware feasibility pass (`docs/hardware-integration/development-priorities.md`):

1. **Live bench** — Circuit mute/Note Tx, Project PGM Tx, USB vs DIN; mark capabilities verified.
2. **SP-404MKII stock EFX MIDI panel** — official CC chart; no USB write ops in core.
3. **MPC MIDI Learn mute pack** — approach C translation; hardware-test before claiming.
4. **FM1 Open V14+ reactive panel** — prefer Open over unofficial processors.
5. **Live port rebind** — map sim Scenes onto real Web MIDI port IDs.
6. **ZED Web Audio meter** — capture only.
7. **Optional librarians** — Circuit SD pack builder (original code); open404/Sparky read-only sidecar.
8. **NativeBridgeTransport / SQLite / Playwright** — as before; Plugin SDK only for on-device audio plugins (no Dawlessdaw IPC).
