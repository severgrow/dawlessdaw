# Timing Lab (Milestone 2)

**Honesty:** **experimental / untested** until Patryk confirms on hardware. Never becomes the studio clock master. Never auto-applies delay correction.

Brief: five-features Milestone 2. Reuses musical position from [circuit-intelligence.md](./circuit-intelligence.md).

## Stage A — Clock Health (passive)

Compact panel: **Settings → Timing**.

| Metric | Meaning |
|--------|---------|
| Status | **STABLE** / **VARIABLE** / **CLOCK LOST** / **UNKNOWN** |
| Clock | Detected vs missing (silence &gt; ~400 ms) |
| BPM | From Circuit-in F8 (24 PPQN) |
| Fluctuation | Rolling BPM stddev |
| Jitter | Mean abs deviation of inter-clock intervals |
| Gaps | Intervals ≫ expected since last Start |
| Restarts | Start after Stop |
| Duplicate? | Clocks from &gt;1 input port in a short window (hint only) |

Engine: `ClockHealthMonitor` in `@dawlessdaw/sequencer`. Wired from Circuit-in clock bus; foreign input clocks only feed the duplicate-source hint. Bar/beat mirrored from M1 musical position.

**UI:** the same BPM feeds the Circuit tempo follow display on Transport / Play / Jam — display only; see [circuit-tempo-follow.md](./circuit-tempo-follow.md). Does not enable app clock forwarding.

## Stage B — MIDI → audio Latency Lab (user-triggered)

Same Timing panel. You pick destination (MPC / SP / FM1) + USB audio input (ideally ZED mix), press **Run latency test**. Splot sends a few short notes, listens for onsets, reports **min / median / max** + confidence. Optional save to `localStorage` (`dawlessdaw.timingLab.calibration`).

**Honest limits**

- Includes **sound attack time** + USB/audio path — not pure MIDI transport latency.
- Input is **never** routed to speakers (no monitor loop).
- **No automatic delay correction** — calibration is a note for later Timing features.
- Main-thread analyser polling — approximate; treat as a lab, not a DAW ping.

## Hardware checklist (Patryk)

Leave **experimental** until confirmed.

1. Settings → Timing. Press Play on Circuit — Clock Health should move toward STABLE with ≈BPM.
2. Stop Circuit — status → CLOCK LOST after a moment.
3. Assign MPC (or SP/FM1) out + allow Chrome audio input (ZED).
4. Run latency test with monitors quiet / no loop. Note min/median/max.
5. Confirm app did **not** change clock routing or add delay to live notes.

## Checks

`npm test` · `npm run typecheck` · `npm run build` · `npm run smoke`
