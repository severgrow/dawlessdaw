# Phase 2 — Live bench + Section Bridge

## What this phase adds

1. **Live port matching** for Circuit / MPC / SP-404 / FM1 (name hints + manual override + localStorage).
2. **My Studio** routing preset with USB remaps (T5+T6→FM1 **ch5+ch6**, T1–4→MPC **ch9–12** optional/no-op when absent, T7–8 internal; **SP not on T6 USB** in this preset; clock **not** through app by default — thru box optional).
3. **Bench Test** workspace with Pass/Fail/Unsure and JSON export (includes thru-box clock-without-notes check).
4. **Section Bridge** (Circuit Project PGM ch16 → SP PC **ch13** / MPC PC **ch15** + Studio Scene) + Panic. Mute Learn = CC 20 **ch15**.
5. Rename **NervOS → Dawlessdaw** across the codebase.

## Hardware you should set before Bench

See **[live-run-guide.md](./live-run-guide.md)** (FM1 = **H-1**, not Open) and [setup-macos.md](./setup-macos.md).

## Tests

Unit tests cover port matching, My Studio route shape, and Section Bridge PGM decode. They **do not** prove hardware behaviour.
