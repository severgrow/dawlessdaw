# Handover: Dawlessdaw sprint (22 Nov 2026)

For the next agent. Read this, then `README.md`, then the docs it links to. Locked owner decisions: [DECISIONS.md](./DECISIONS.md).

## Who you're working with

- The owner is **not a coder**. Use plain English, give **one step at a time**, and say exactly what to press on the hardware.
- They work on a **MacBook + Chrome** at `http://localhost:5173`. Their copy of the repo is `~/dawlessdaw`. To update it, they press Ctrl+C in Terminal, then run `git checkout main && git pull`, `npm install`, `npm run dev`. If `package-lock.json` blocks the checkout, they run `git checkout -- package-lock.json` first.
- Cloud sessions can't see their Mac, USB or MIDI. They paste Terminal output and screenshots.

## Standing rules (from the owner)

- Never flash firmware, send SysEx, or write to device storage. Never route MIDI clock through the app by default.
- Don't claim something works on hardware unless the owner confirmed it. Every hardware capability is still **untested**.
- **One branch and one PR per change.** Ask before merging to `main`. Commit messages end with a `Co-Authored-By` line.
- GPL projects (Skiff, SparkyMK2, Circuit Remix) are reference only. MIT projects (open404, h1, MPC Plugin SDK) can be reused with credit.
- Keep device-specific behaviour in device profiles / `packages/devices`.
- Research notes are a Claude Doc: https://claude.ai/artifact/QnT9Kbvsz4TBmR1x5RNCyk (read it with the Claude Docs connector).

## The rig (current)

| Device | Connection | Notes |
|---|---|---|
| Circuit Rhythm (stock 2.x) | USB → Mac; MIDI Out → thru box | Arranger. Tracks 1–8 send on ch 1–8. Macro knobs send CC 21–28 on the selected track's channel. Project change = PC ch16. |
| MPC One (MPC 3) | **MIDI In ← Focusrite Scarlett 2i4 MIDI Out** (the Mac can't see the MPC's own USB) | Not on the thru box any more. The DIN path means app clock works (the Akai USB-B clock limit doesn't apply). |
| SP-404MKII | USB → Mac + DIN clock from the thru box | Optional MIDI Mode A (bank A–J = ch 1–10, pads = notes 36–51). |
| M-VAVE FM1 on Skiff | USB only (port name "Felucca") | **Never on the thru box.** |
| ZED-10FX | USB audio only ("USB Audio CODEC") | No MIDI. |

## Git / PR state

| Branch / PR | State |
|---|---|
| `main` | Includes merged [#13](https://github.com/severgrow/dawlessdaw/pull/13) (`69b6354`) and [#14](https://github.com/severgrow/dawlessdaw/pull/14) (`094a00b`). |
| `claude/circuit-controller` | [#16](https://github.com/severgrow/dawlessdaw/pull/16) — open, rebased onto post-#14 `main`. **Ask before merging.** |

Stale branches that are already merged (`claude/fix-typecheck-script`, `claude/remove-simulation`, `claude/skiff-*`, `claude/sp404-banks-and-sample-prep`, `cursor/*`, `phase-2-live-bench`, `claude/bench-label-fix`, `claude/never-forward-sysex`, `claude/mpc-via-scarlett`, `claude/lit-button-hover`, `claude/ux-tighten`, `claude/brand-style`) can be deleted. Sessions here couldn't delete remote branches (403), so the owner does it on the GitHub Branches page.

## Locked decisions (owner: "yeah all go")

1. Merge #13 then #14 — **done**.
2. ON colour: deep burgundy `#9a2a45` (screenshot review still pending).
3. Skiff T1–4 on MIDI channels **1–4** (My Studio); hardware must match.
4. Advanced = real MIDI ch + CC + Custom CC + Skiff channel table.
5. Device colours: SP burgundy, FM1 mint, MPC bone `#e8e1d2`.
6. Scenes stay gone; Sessions enough for presets.
7. Rig grid read-only; routing edits on Controller.
8. Continue Controller CSS / browser / bench / docs / PR.
9. SP effect CTRL + Scarlett MPC Step 3: proceed as listed; **do not claim hardware Pass**.

Full table: [DECISIONS.md](./DECISIONS.md).

## Palette

- Black background. Two colours only, plus greyscale (+ bone for MPC device chrome).
  - **ON** = **deep, dark burgundy** `#9a2a45` (`--accent-ink #f5e9ec`). Not yet reviewed in a screenshot.
  - **ALERT** = pastel mint `#9fdcc2` / `#b5ead3`.
  - **Bone** = `#e8e1d2` (`--bone`) for MPC.
- Tokens in `apps/web/src/styles/studio.css`. Film grain: `body::after`, 16%.

## Circuit Controller (`claude/circuit-controller`)

Spec + model + screen: see [circuit-controller.md](./circuit-controller.md).

**Done (software):**
- Model, routes, presets, undo, learn, Test sweep, Sessions field — unit tested.
- Controller workspace UI + tab; Rig track summary read-only → "Edit in Controller".
- Controller CSS (brand tokens, device colours, 390px overflow guard).
- Bench copy updated for Controller / My Studio / Level on knob 8; added **h6** (SP effect CTRL) and **g4** (MPC Learnable).
- Docs: `circuit-controller.md`, `DECISIONS.md`, updated `skiff-fm1.md`, `sp404-banks-and-samples.md`.

**Still for the human / next agent:**
1. Owner screenshot check of burgundy `#9a2a45` on black (small labels).
2. ~~Cloud Playwright fake-MIDI smoke~~ done (Controller UI + Advanced + 390px). Owner Mac Live check still useful.
3. Hardware Step 3 (Scarlett → MPC) — see below; **unverified**.
4. Bench h6 (SP effect CTRL mapping) and Skiff channel 1–4 confirmation on the FM1 box.
5. Ask before merging the Controller PR to `main`.
6. Optional cleanup: old Rig-grid `TrackPlan` helpers kept for migration only.

## Owner's hardware test that's still pending ("Step 3")

**Do not mark these Pass from a cloud session.**

1. ✅ Audio MIDI Setup shows the Scarlett.
2. ⏳ Setup tab → Akai MPC One → **MIDI out = Scarlett 2i4 USB**.
3. ⏳ MPC One: Menu → Preferences → MIDI/Sync. Turn on its MIDI In row, Receive = MIDI Clock, clock send off. Tracks 1–4: MIDI input = MIDI In port, ch 9/10/11/12 (not "All"), **monitoring = In (not Auto)**.
4. ⏳ Rig → Tempo → **→ MPC on**. Circuit Play: do the MPC's notes and tempo follow? (Controller preset My Studio · T1–4 → MPC for notes.)
5. ⏳ Mark bench g2, g3 and i, export the JSON to `docs/bench-results/<date>.json`. No bench results exist yet.

After that: FM1 (h, h2, h3, h4), Circuit (a–d), SP (e, h5, h6), MPC Learnable (g4).

## Unverified facts (don't present as confirmed)

- SP-404MKII on-device import steps.
- SP effect CC → knob mapping, and the effect on/off CC.
- MPC menu names, pad 1 = note 37 (Classic), MIDI Learn steps.
- Skiff Program Change base and past-last-sound behaviour.
- Circuit Rhythm macro CC 21–28 per track channel (bench h2).

## Dev notes

- `npm install && npm test && npm run typecheck && npm run build`.
- Dev server: `cd apps/web && npx vite --port 5173`. React StrictMode is on. **Don't put `useStudioActions()` functions in effect dependency arrays**.
- Playwright is available for fake Web MIDI browser checks.
- `apps/web/tsconfig.tsbuildinfo` is tracked and changes on build — harmless noise in diffs.
