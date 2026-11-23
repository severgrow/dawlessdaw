# Circuit tempo follow (display)

**Honesty:** **experimental / untested** until Patryk confirms on hardware.

Splot reads tempo from **Circuit MIDI clock** (USB in, F8 @ 24 PPQN) and shows it clearly in Transport, Play (Rig), and Jam. It does **not** become the studio clock master and does **not** turn on app MIDI clock forwarding by default.

## What you see

| State | Meaning |
|-------|---------|
| Waiting for Circuit | No clock heard yet — press **Play** on the Circuit |
| Listening… | Clocks arriving; BPM still settling |
| Large BPM + “Circuit” | Stable estimate from Clock Health |
| Circuit · variable | BPM shown; jitter / gaps (browser timing) |
| Clock lost | No F8 for ~400 ms — last BPM may linger faded |

Bar.beat comes from Circuit Intelligence musical position when available.

## How the rest of the rig follows

- **Hardware paths stay the source of sync:** Circuit → thru box → SP DIN, Scarlett → MPC DIN, etc.
- Splot **displays** the tempo it hears on Circuit USB in.
- **App clock forward remains off by default** (Preferences). Optional “MPC follows Circuit Play” / SP forward switches stay opt-in in Rig / Setup — unchanged by this feature.

## Limits (honest)

- Browser Web MIDI delivers clock on the **main thread** — not sample-accurate. Treat BPM as ≈, not a DAW tempo track.
- Estimation needs a short run of F8s (Clock Health / Timing Lab).
- SP (and others) sync via **thru / DIN**, not because the app rebroadcasts clock.
- Duplicate clock sources (more than one input port) are a **hint** only — see Timing Lab.
- Experimental until hardware Bench confirm.

## Where it lives in code

- Display model: `apps/web/src/tempo/circuitTempo.ts`
- UI: `apps/web/src/components/CircuitTempo.tsx` (Transport / Rig / Jam)
- Engines reused: `ClockHealthMonitor` + musical position (`@dawlessdaw/sequencer`) — same as [timing-lab.md](./timing-lab.md) / [circuit-intelligence.md](./circuit-intelligence.md)

## Manual check (Patryk)

1. Connect Circuit USB; allow MIDI. Open Play — Tempo should say **Waiting for Circuit**.
2. Press **Play** on Circuit — BPM rises to ≈ your tempo; Transport + Jam match.
3. Stop Circuit — status → **Clock lost** after a moment.
4. Confirm app clock forwarding stayed **off** unless you turned a Rig switch on.
5. Confirm SP still follows via thru box as before (ear / device display).

## Checks

`npm test` · `npm run build` · `npm run smoke`
