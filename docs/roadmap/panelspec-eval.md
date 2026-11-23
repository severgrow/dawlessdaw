# Step 12 — hexatrack panelspec eval

**Date:** 2026-11-23  
**Tip audited:** hexatrack `audiodestrukt/hexatrack` @ `722828ccb171` (MIT)  
**Decision:** **Extend Vitest.** Do **not** adopt the panelspec Rust runner / JSON-lines adapter as a second test system.

## Pick one (locked)

| Option | Verdict |
|--------|---------|
| Vend / run hexatrack `crates/panelspec` (dev-only adapter) | **No** |
| Strengthen Vitest behavioural harness (commands + virtual clock → outbound MIDI) | **Yes — this is the path** |

Do not dual-run forever. Revisit panelspec **only** if Splot later needs the same YAML suite against a non-JS implementation (firmware emulator / native port). That is not the current product surface.

## What panelspec is (MIT — verified)

- YAML behaviour specs: physical inputs → observe paths / events (`docs/spec-format.md`).
- Runner is a **Rust CLI** speaking **JSON-lines** over stdin/stdout (`hello` / `reset` / `input` / `advance` / `observe` / `events`).
- Time moves only on `advance` (good idea — we already do this with `createInjectedClockService`).
- Skeleton JS adapter (~60 lines) exists; useful as a **protocol reference**, not as a dependency.
- Suites target **panel devices** (Octatrack trigs/knobs, XDJ CUE/PLAY) — not Splot’s Web MIDI route / StudioCommands surface.
- `seq-core` stays **REFERENCE only** (different product; not imported).

## Why Vitest wins for Splot now

1. **Already shipping the harness.** A2 routing stress, A3 clock/transport, A5 journey smoke, StudioCommands tests, MockMidiTransport — all Vitest, zero Rust toolchain.
2. **Cost of panelspec.** Adds Cargo + `panelspec` binary + device vocab YAML + a long-lived adapter process to CI for a JS monorepo that already has `npm test`.
3. **Wrong fixture grain.** Splot cares about `panic` / `setRoute` / hanging notes / `forwardClock: false` / capture — not `press: trig5` + `track.1.step.5.lock.src_a`.
4. **Deep OSS Pass 2** already ranked this as **ADAPT Vitest first**; optional REUSE only if lighter than growing Vitest. It is not lighter today.
5. **Licence.** MIT allows reuse with credit — we simply choose not to, for engineering fit. No GPL/AGPL involved.

## What we keep from the idea (concept ADAPT)

- Behaviour as **inputs + virtual time → outbound MIDI / state** (not UI pixels).
- Provenance comments on tests (`experimental` / untested hardware).
- Deterministic clock (`advance`, not wall clock).
- Thin shared session helper for new behavioural tests (spike in this PR).

## Spike (this PR)

- `packages/midi/src/behaviouralSession.ts` — minimal Vitest session: MockMidi + inject / sent / clear.
- `packages/midi/src/behaviouralSession.test.ts` — proves the helper; documents the chosen path.
- No hexatrack source vendored. No engine behaviour change.

## When to reopen panelspec

Only if all of these become true:

1. A second implementation language must share the **same** behaviour suite, and  
2. Maintaining two Vitest ports would be worse than one YAML suite + adapters, and  
3. Patryk approves adding a Rust/dev panelspec toolchain.

Until then: **one runner = Vitest.**

## Credit / refs

- hexatrack MIT © 2026 Dan Newcome — https://github.com/audiodestrukt/hexatrack @ `722828ccb171`
- Related: [deep-oss-engineering-integration.md](./deep-oss-engineering-integration.md) · plan step 12 in store `docs/implementation-plan-next.md`
