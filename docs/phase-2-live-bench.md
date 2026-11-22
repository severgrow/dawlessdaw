# Phase 2 — Live bench + Section Bridge

## What this phase adds

1. **Live port matching** for Circuit / MPC / SP-404 / FM1 (name hints + manual override + localStorage).
2. **My Studio** routing preset (T1–4→MPC, T5→FM1, T6→SP, T7–8 internal; clock **not** through app by default).
3. **Bench Test** workspace with Pass/Fail/Unsure and JSON export.
4. **Section Bridge** (Circuit Project PGM ch16 → optional SP/MPC PC + Studio Scene) + Panic.
5. Rename **NervOS → Dawlessdaw** across the codebase.

## Hardware you should set before Bench

See the Mac runbook at the end of the PR description / README.

## Tests

Unit tests cover port matching, My Studio route shape, and Section Bridge PGM decode. They **do not** prove hardware behaviour.
