# SPLOT — Software-first, hardware-ready master roadmap

**Status:** Planning document. Implement only from separately approved tasks.  
**Source:** Patryk, 2026-11-23. Repo: `severgrow/dawlessdaw` (brand: **Splot MIDI Brain**).  
**Baseline tip for Deep OSS Pass 1–2:** `main` @ `3a05561` (v0.2 tip after MMT-8 behaviour tests #51).  
**Related:** [deep-oss-engineering-integration.md](./deep-oss-engineering-integration.md), [mmt8-lessons.md](../mmt8-lessons.md).

## Immediate rule

Do not interrupt, rebase, merge, or expand scope of in-flight work because this roadmap exists. Batch merge only when Patryk asks.

## Product direction

**SPLOT — Make your hardware work as one.** Universal hardware music studio operating layer. First bench: Circuit Rhythm, MPC One, SP-404MKII, FM1 — not permanent architecture. Unknown MIDI via generic routing + Learn; deep integrations optional.

### Product family

| Product | Horizon | Notes |
| --- | --- | --- |
| **SPLOT SOFTWARE** | Now | Local-first; must be useful before hardware |
| **SPLOT LITE** | ~6 months+ | Standalone MIDI brain; ~£149 target (feasibility TBD) |
| **SPLOT STUDIO** | Later | MIDI brain + mixer + recorder; design targets only |

**Hardware manufacturing: not now.** Software must evolve without rewrite.

## Fundamental principle

Musical intelligence in a shared engine, not React/Chrome-only. Shared behaviour, data models, commands, routing rules, fixtures — not necessarily identical source on every MCU. No premature language rewrite.

## Master backlog phases

Statuses: `BACKLOG` / `READY` / `IN PROGRESS` / `BLOCKED` / `VERIFIED` / `DONE`. Simulation ≠ hardware verification.

### Phase A — Software reliability first (P0)

A1 Real-hardware validation · A2 Bulletproof MIDI routing · A3 Stable clock/transport · A4 Audio + FLIP reliability · A5 Regression/stress.

**Exit:** Complete real sessions without unexpected routing loss, lost projects, feedback, or unexplained crashes.

### Phase B — Universal device architecture (P0/P1)

B1 Remove device-specific core assumptions · B2 Device discovery · B3 Universal Instrument model · B4 First-run (two generic MIDI devices in minutes).

**Exit:** Core workflows work with arbitrary compatible MIDI; not tied to first rig.

### Phase C — Portable software engine (P0/P1)

C1 Headless StudioEngine · C2 MIDI backend abstraction · C3 Shared clock service · C4 Audio backend abstraction · C5 Versioned storage · C6 UI-independent commands · C7 Headless tests.

**Exit:** Main musical logic runs without browser UI; stable contracts for native/embedded.

### Phase D — Performance Memory (P1)

D1 MIDI event history · D2 Retrospective capture (last N bars) · D3 Recall/replay · D4 Timeline · D5 MIDI+audio linkage.

**Note:** Milestone 4 Performance Memory is partial — gap-fill vs this phase after bench.

### Phase E — Audio + MIDI unification (P1)

E1 Unified instruments/buses · E2 Multichannel-ready model · E3 Instrument-aware FLIP · E4 MIDI-guided audio · E5 Mix scenes · E6 Audio diagnostics.

### Phase F — Performance control (P1/P2)

F1 Universal Super Macros · F2 Snapshot/morph · F3 Safe scene recall · F4 Universal control surfaces.

### Phase G — Product quality (ongoing P0/P1)

G1 Coherent UX · G2 Reliability · G3 Versioned projects · G4 Honest capabilities · G5 CI · G6 Native desktop packaging (later).

## Explicitly deferred

Cloud/sync, AI assistant, marketplace, social, full DAW timeline, internal synths, large sample libs, plugins, PCB/enclosure/BOM, firmware flash infra, proprietary protocol experiments, unsupported device-state reconstruction, full Win/Linux before architecture ready.

## Absolute preserve rules

No destructive git; no silent overwrite; no auto-merge; one focused PR per approved task; keep working workflows; incremental extraction; no firmware/SysEx/storage writes; no unverified hardware claims; diagnostics must not break routing; no clock-default changes without approval; migrate data; avoid speculative deps.

**Licence:** No GPL/AGPL/MMT-8 firmware into product without Patryk approval. Prefer REUSE (permissive) → ADAPT → REIMPLEMENT → REFERENCE → IGNORE.

## Six-month planning windows (soft)

1 Reliability + bench · 2 Universal devices + engine boundaries · 3 Performance Memory · 4 MIDI/audio unify + FLIP · 5 Polish + native MIDI proof · 6 Stability review; optional tiny HW PoC decision.

## After current stack: first candidates

1. **A1** Real-hardware Bench pass on Patryk’s rig — mark verified/experimental honestly.  
2. **A2** Routing panic / hanging notes / disconnect stress (next software queue after Deep OSS Pass 1–2).  
3. **A3** Clock authority + documented browser timing limits.  
4. **A4** FLIP + session recorder long-run reliability.  
5. **B4 / G1** First-run polish on Connect wizard.

## What already exists on tip (`3a05561`)

Layered packages (`midi` / `routing` / `sequencer` / `devices` / …), Web + Mock + NativeBridge stub transports, Circuit Mirror/Intelligence, Timing Lab, Super Macros, Performance Memory, MIDI-guided FLIP, Session Recorder, Vitest behavioural MIDI tests (incl. MMT-8-inspired note safety). See [architecture.md](../architecture.md) and [limitations.md](../limitations.md).
