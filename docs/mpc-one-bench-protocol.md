# MPC One — Bench protocol (pointer)

**Full checklist (Ethernet + DIN, honesty labels):** see the agent-store doc  
`docs/mpc-one-bench-protocol.md` in the project store, or ask the agent for `/cursor/stores/self/docs/mpc-one-bench-protocol.md`.

## Headline

| Path | Sequencer clock | Status until Patryk Passes |
|------|-----------------|----------------------------|
| Scarlett → DIN | Yes (g2 notes / g3 follow) | Untested on hardware |
| Network MIDI / Ethernet / IAC | Notes/Learn only — do not replace g3 | Experimental |
| USB-B MPC port | Clock useless | Honesty-blocked |

## In-app Bench rows

Tests → Bench: **g2**, **g3**, **i** (and related MPC rows). Export JSON after marking.

## Rules

No write-to-MPC · no SysEx/FW · no fake Library Connected · DIN remains the safe follow path.

## Related

- `docs/mpc-via-scarlett.md`
- `docs/roadmap/mpc-deep-integration-feasibility.md`
- `docs/phase-2-live-bench.md`
