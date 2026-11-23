# Handover: Splot MIDI Brain (Phase 0)

For the next agent. Read this, then `README.md`, then the docs it links to. Locked owner decisions: [DECISIONS.md](./DECISIONS.md). Brand: **Splot MIDI Brain** (short: Splot). Header: `splot / midi brain`. Packages / folders / localStorage keys still say `dawlessdaw`.

## Who you're working with

- The owner (**Patryk**) is **not a coder**. Use plain English, give **one step at a time**, and say exactly what to press on the hardware.
- They work on a **MacBook + Chrome** at `http://localhost:5173`. Their copy of the repo is `~/dawlessdaw`. To update it, they press Ctrl+C in Terminal, then run `git checkout main && git pull`, `npm install`, `npm run dev`. If `package-lock.json` blocks the checkout, they run `git checkout -- package-lock.json` first.
- Cloud sessions can't see their Mac, USB or MIDI. They paste Terminal output and screenshots.

## Standing rules (from the owner)

- Never flash firmware, send SysEx, or write to device storage (exception: new WAV in SP SD `IMPORT/`). Never route MIDI clock through the app by default.
- Don't claim something works on hardware unless the owner confirmed it. Use **verified** / **untested** / **experimental** labels only.
- **One branch and one PR per change.** **Ask before merging** to `main`.
- GPL projects (Skiff, SparkyMK2) are reference only. MIT projects (open404, Circuit Remix, Rhythm Plus, Arrhythmia, h1, MPC Plugin SDK) can be reused with credit.
- Keep device-specific behaviour in device profiles / `packages/devices`.
- Every PR: `npm test` + `npm run build` pass; screenshots of every changed screen. Headless UI smoke: `npm run smoke` (after build).
- Research notes are a Claude Doc: https://claude.ai/artifact/QnT9Kbvsz4TBmR1x5RNCyk (read it with the Claude Docs connector).

## The rig (current)

| Device | Connection | Notes |
|---|---|---|
| Circuit Rhythm (stock 2.x) | USB → Mac; MIDI Out → thru box | Arranger. Tracks 1–8 send on ch 1–8. Macro knobs send CC 21–28 on the selected track's channel. Project change = PC ch16. |
| MPC One (MPC 3) | **MIDI In ← Focusrite Scarlett 2i4 MIDI Out** (the Mac can't see the MPC's own USB) | Not on the thru box. DIN path means app clock can work (Akai USB-B clock limit doesn't apply). |
| SP-404MKII | USB → Mac + DIN clock from the thru box | Optional MIDI Mode A (bank A–J = ch 1–10, pads = notes 36–51). |
| M-VAVE FM1 on Skiff | USB only (port name "Felucca") | **Never on the thru box.** |
| ZED-10FX | USB audio only ("USB Audio CODEC") | No MIDI. |

Default Controller preset: **Ploe Live v1** — T1–T4 → MPC, T5–T6 → Skiff 1–2, T7–T8 → SP banks A–B. Older My Studio presets remain available.

## What's verified (22 Nov 2026)

See [bench-results/2026-11-22-first-full-rig.md](./bench-results/2026-11-22-first-full-rig.md). Only the Circuit→MPC / FM1 / SP sequence playback that day is **verified**. Other bench rows stay **untested**.

## Git / PR state

| Branch / PR | State |
|---|---|
| `main` | Tip after live-preview merge: `22408c8` ([#38](https://github.com/severgrow/dawlessdaw/pull/38)). Also includes earlier merges through Controller / UX / sequencer / FLIP work. |
| Phase 0 (this work) | Branch `cursor/phase-0-splot-ac80` — **ask before merging.** |
| `claude/circuit-controller` | [#16](https://github.com/severgrow/dawlessdaw/pull/16) — may still be open / superseded by later merges; check GitHub before acting. **Ask before merging.** |

After Phase 0 merges (only when Patryk approves): tag `v0.2-first-working-rig`. Do **not** tag before merge approval.

Stale remote branches that are already merged can be deleted by the owner on the GitHub Branches page (cloud agents often get 403).

## Locked decisions (owner: "yeah all go" + Phase 0)

1. Merge #13 then #14 — **done**.
2. ON colour: deep burgundy `#9a2a45` (screenshot review still pending).
3. Skiff T1–4 on MIDI channels **1–4** (My Studio); hardware must match. Ploe Live uses Skiff 1–2 on T5–T6 with the same channel table.
4. Advanced = real MIDI ch + CC + Custom CC + Skiff channel table.
5. Device colours: SP burgundy, FM1 mint, MPC bone `#e8e1d2`.
6. Scenes stay gone; Sessions enough for presets.
7. Rig grid read-only; routing edits on Controller.
8. Brand string **Splot MIDI Brain**; header `splot / midi brain` (packages/keys unchanged for now).
9. Ask before merging any PR. Serialize phases unless he says otherwise.

Full table: [DECISIONS.md](./DECISIONS.md).

## Palette

- Black background. Two colours only, plus greyscale (+ bone for MPC device chrome).
  - **ON** = **deep, dark burgundy** `#9a2a45` (`--accent-ink #f5e9ec`).
  - **ALERT** = pastel mint `#9fdcc2` / `#b5ead3`.
  - **Bone** = `#e8e1d2` (`--bone`) for MPC.
- Tokens in `apps/web/src/styles/studio.css`. Film grain: `body::after`, 16%.

## Phase 0 (stability + Splot rename) — software

- Test-tab React #185: `deepSyncController.getSnapshot()` caches; rebuild only in `emit()` (see #38 + unit test). Other stores audited: StudioRuntime uses Zustand hydrate-on-notify (safe); Flip/capture use `subscribe`→`setState` (not `useSyncExternalStore`).
- Error boundaries per workspace + Rig art: "This panel hit a problem" / Retry / Copy error.
- `npm run smoke` — Playwright + system Chrome against `apps/web/dist`, keys 1–8, fail on pageerror / blank `#root`.
- Default preset **Ploe Live v1**; My Studio presets kept.
- Bench narrative for 22 Nov; `apps/web/tsconfig.tsbuildinfo` untracked (already covered by `*.tsbuildinfo` in `.gitignore`).

## Still for the human / next agent

1. Owner screenshot check of burgundy `#9a2a45` on black (small labels).
2. Hardware Step 3 (Scarlett → MPC) checklist below — mark honestly; some note routing already **verified** 22 Nov, but formal bench JSON may still be missing.
3. Bench h6 (SP effect CTRL) and remaining Skiff / latency rows.
4. **Ask before merging** Phase 0; then tag `v0.2-first-working-rig` when he says so.
5. Phase 1+ only after Phase 0 merges (unless he says otherwise).

## Owner's hardware checklist (do not mark Pass from a cloud session)

1. ✅ Audio MIDI Setup shows the Scarlett.
2. Setup tab → Akai MPC One → **MIDI out = Scarlett 2i4 USB**.
3. MPC One: Menu → Preferences → MIDI/Sync. Turn on its MIDI In row, Receive = MIDI Clock, clock send off. Tracks 1–4: MIDI input = MIDI In port, ch 9/10/11/12 (not "All"), **monitoring = In (not Auto)**.
4. Controller: preset **Ploe Live v1**. Circuit Play on T1–T4 / T5–T6 / T7–T8 — confirm MPC / FM1 / SP as on 22 Nov.
5. Optional: Rig → Tempo → **→ MPC on** for app clock follow (separate from note routing).
6. Mark bench rows honestly; export JSON to `docs/bench-results/<date>.json`.

## Unverified facts (don't present as confirmed)

- SP-404MKII on-device import steps.
- SP effect CC → knob mapping, and the effect on/off CC.
- MPC menu names, pad 1 = note 37 (Classic), MIDI Learn steps.
- Skiff Program Change base and past-last-sound behaviour.
- Circuit Rhythm macro CC 21–28 per track channel (bench h2) as a formal Pass.

## Dev notes

- `npm install && npm test && npm run typecheck && npm run build && npm run smoke`.
- Dev server: `cd apps/web && npx vite --port 5173`. React StrictMode is on. **Don't put `useStudioActions()` functions in effect dependency arrays**.
- Playwright smoke uses system Chrome (`channel: 'chrome'`). Unit tests stay on Vitest (`npm test`).
