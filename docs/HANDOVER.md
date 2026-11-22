# Handover: Dawlessdaw sprint (22 Nov 2026)

For the next agent. Read this, then `README.md`, then the docs it links to.

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

## Git / PR state (all pushed)

| Branch | PR | State |
|---|---|---|
| `main` | — | Has everything up to and including https://github.com/severgrow/dawlessdaw/pull/12 (MPC via Scarlett, per-device clock, never forward SysEx, etc.). |
| `claude/ux-tighten` | https://github.com/severgrow/dawlessdaw/pull/13 | **Open, not merged.** The UI went from 9 tabs to 5 (Rig, Samples, Sections, Test, Setup), plus the audio preview, the finished SP Samples page and Section Bridge persistence. |
| `claude/brand-style` | https://github.com/severgrow/dawlessdaw/pull/14 (base: `claude/ux-tighten`) | **Open, not merged.** Brand pass: hardware drawings (`DeviceArt`), Rig map (`RigMap`), rounded OP-1-style shapes, film grain, two-colour palette. |
| `claude/circuit-controller` | **no PR yet** (base would be `claude/brand-style`) | **Work in progress.** The Circuit Controller. Contains #13 and #14. |

To merge: #13 first, then retarget #14 to `main` and merge it, then open a PR for `claude/circuit-controller`. The owner said "merge 13 and 14" was pending their go-ahead; **ask before merging.**

Stale branches that are already merged (`claude/fix-typecheck-script`, `claude/remove-simulation`, `claude/skiff-*`, `claude/sp404-banks-and-sample-prep`, `cursor/*`, `phase-2-live-bench`, `claude/bench-label-fix`, `claude/never-forward-sysex`, `claude/mpc-via-scarlett`, `claude/lit-button-hover`) can be deleted. Sessions here couldn't delete remote branches (403), so the owner does it on the GitHub Branches page.

## Palette (latest owner direction)

- Black background. Two colours only, plus greyscale.
  - **ON** = **deep, dark burgundy** `#9a2a45`: on, live, OK, MIDI, selected. It has light text on its fills (`--accent-ink #f5e9ec`). The owner said "deeper darker burgundy not pink". This latest shade is **not yet reviewed in a screenshot**.
  - **ALERT** = pastel mint `#9fdcc2` / `#b5ead3`: stop, fail, warn, clip, audio. Dark text on its fills (`--alert-ink`).
- Tokens are semantic: `--on*`, `--alert*`, roles `--accent`, `--ok`, `--warn`, `--err`, all in `apps/web/src/styles/studio.css`.
- Film grain over everything: the same SVG noise as severgrow-01's "Soil" texture (`body::after`, 16%).
- To check: with the darker ON colour, small burgundy text on black (for example `.cable-midi.on .cable-label`, which uses `--on-2`, and `h1::before`) may be too low-contrast. Consider `--text-dim` for those labels.

## Circuit Controller (branch `claude/circuit-controller`): where it stands

The owner's spec, summarised: a "Circuit Controller" workspace that turns the Circuit into a controller for the SP-404, FM1 (Skiff) and MPC, with no MIDI numbers.
- A Circuit drawing with T1–T8 buttons and 8 knobs that turn on screen.
- Device cards with drag-to-assign.
- A track panel: destination in plain words, first-note learn with a 16-pad map, an 8-slot knob page (named targets, twist to pick, min/max range, Test sweep).
- A live strip of the last 10 events in plain sentences.
- Presets: "My Studio", save, load, rename, copy track, undo ×20, included in sessions.
- Rules: knobs follow the Circuit's selected track; anything unmapped is dropped; never PC/CC unless mapped; never SysEx; an honest note that Circuit buttons don't send MIDI.
- The spec message was **cut off** at "Advanced toggle reveals real…". It was implemented as "shows real MIDI channels / CC numbers + Custom CC + Skiff channel table". Confirm with the owner.

**Done (tested in unit tests, not in a browser yet):**
- `packages/devices/src/controller.ts`: the model and device knowledge (SP banks/Mode A, Skiff tracks + channel table, MPC tracks → channels `[9,10,11,12,13,14,16,1]`, skipping 15, which is the Section Bridge control channel). Also:
  - named knob targets (`KNOB_TARGETS`), the My Studio presets (SP / MPC variants), copy, swap (twist to pick), sanitize, and migration from the old Rig-grid `TrackPlan`
  - `buildControllerRoutes()`, `describeIncoming()` (plain-English events) and warnings
- `packages/devices/src/controller.test.ts`: 13 tests (routing, knobs follow the track, ranges, sound steps, custom CC, h1 notes-only, din-only, drops, copy/swap, descriptions, sanitize, migration).
- `packages/routing`: a new `cc.scale` (per-knob min/max).
- `apps/web/src/studio/runtime.ts`:
  - routes now = controller routes + clock-only routes; the old `trackPlan` is only used for migration
  - presets, save/load, undo, learn (first note / twist), knob values, last knob, active Circuit track, events, Test sweep (CC sweep min→max→min over ~2.4 s)
  - saved in localStorage setup and included in session export/import (`packages/sessions` passes a `controller` field through)
- `apps/web/src/workspaces/ControllerWorkspace.tsx`: the full screen. There's a new tab "Controller" (key 2; tabs are now 1–6). The Rig page's grid was replaced by a read-only track summary plus "Edit in Controller".

**Not done (next steps, in order):**
1. **CSS for the Controller screen.** None of its classes are styled yet:
   - `.controller`, `.preset-bar`, `.pb-field`, `.big-select`, `.ctl-layout`
   - `.circuit-face`, `.ct-tracks`, `.ct-track`, `.ct-pad.hit`, `.ct-badge`, `.on-circuit`, `.drag-over`
   - `.ct-knobs`, `.ct-knob`, `.ctk-label`, `.ctl-knob .kn-track/.kn-arc/.kn-cap/.kn-glow/.kn-ptr`
   - `.device-cards`, `.dev-card`, `.dev-card-art`, `.dc-*`
   - `.track-panel`, `.dest-choice`, `.dest-btn`, `.dest-art`, `.dest-off-glyph`, `.slot-row`, `.howto-line`, `.learn-big`
   - `.pad-map`, `.pm-pad`
   - `.knob-page`, `.knob-row(.moved)`, `.kr-*`, `.range2` (two overlaid range inputs)
   - `.check-pill`, `.honest-note`, `.live-strip`, `.ls-now`, `.ls-list`
   - `.track-summary`, `.ts-cell` (Rig)
   - device colour classes `.dev-sp` / `.dev-fm1` / `.dev-mpc` / `.dev-off`

   **Device colours (decision made, tell the owner):** SP = ON burgundy, FM1 = ALERT mint, MPC = bone `#e8e1d2`. Track buttons take their destination's device colour. The Circuit's own track colours weren't copied because they aren't verified.
2. **Browser check.** Use headless Chromium with a fake `navigator.requestMIDIAccess` (ports named "Circuit Rhythm", "Scarlett 2i4 USB", "Felucca", "SP-404MKII") and inject Circuit messages. Check:
   - assigning by click and by drag
   - first-note learn, twist to pick, Test sweep bytes, knob animation
   - the live strip, undo (⌘Z), save/load/rename/delete
   - no horizontal overflow at 390 px
3. **Bench tests** (`packages/devices/src/bench.ts`):
   - update h2/h4: the My Studio FM1 knob 8 is now **Level**, and "Sound (steps)" is an optional target
   - update h/h5 to point at the Controller tab
   - add **h6 "SP effect knobs from Circuit macros"**: the SP effect CTRL CCs 16–19, 80–83 are from Roland's MIDI chart, but which knob each moves and which channel the SP listens on in Mode A are unconfirmed. The SP effect on/off CC is deliberately not offered.
   - add an MPC "Learnable" test
4. **Docs:**
   - new `docs/circuit-controller.md`
   - update `docs/skiff-fm1.md`: My Studio now puts Skiff tracks 1–4 on **channels 1–4** (Skiff default), per the owner's spec. The owner previously set Skiff T1–T4 CHANNEL = 5–8, so tell them to set them back to 1–4, or use Advanced → Skiff track channels.
   - update `docs/sp404-banks-and-samples.md` (first-note learn moved from the Rig tab to the Controller)
5. **Cleanup:** the old Rig-grid code (`TrackPlan`, `setTrackSend`, `applyTrackPreset`, `trackPlanWarnings`, `spNoteOffset` learn) is now only used for migration and tests. Remove the leftover UI actions or keep them for migration only.
6. Open the PR (base `claude/brand-style`), run tests + build, and ask before merging.

**Scenes:** the spec says "include presets in Scenes and Sessions". Sessions export/import carries them. The Scenes UI was removed in #13, so it was not wired.

## Owner's hardware test that's still pending ("Step 3")

The owner was midway through step 3.3 when the UI work started:
1. ✅ Audio MIDI Setup shows the Scarlett.
2. ⏳ Setup tab → Akai MPC One → **MIDI out = Scarlett 2i4 USB**.
3. ⏳ MPC One: Menu → Preferences → MIDI/Sync. Turn on its MIDI In row, Receive = MIDI Clock, clock send off. Tracks 1–4: MIDI input = MIDI In port, ch 9/10/11/12 (not "All"), **monitoring = In (not Auto)**. The owner asked why only the selected MPC track played; that's the monitoring/"All" setting. The menu names haven't been confirmed on their firmware.
4. ⏳ Rig → Tempo → **→ MPC on**. Circuit Play: do the MPC's notes and tempo follow?
5. ⏳ Mark bench g2, g3 and i, export the JSON, and save it to `docs/bench-results/<date>.json`. No bench results exist yet.

After that: the bench tests for the FM1 (h, h2, h3, h4), Circuit (a–d) and SP (e, h5).

## Unverified facts (don't present as confirmed)

- SP-404MKII on-device import steps. Roland's sites were blocked from the cloud container, so the Samples page points to Roland's manual and app instead.
- SP effect CC → knob mapping, and the effect on/off CC.
- MPC menu names, the MPC pad 1 = note 37 (Classic) assumption, and the MPC MIDI Learn steps.
- Skiff Program Change base (0- or 1-based) and what happens past an engine's last sound.
- Circuit Rhythm macro CC 21–28 per track channel. The whole design assumes this; bench h2 checks it.

## Dev notes

- `npm install && npm test && npm run typecheck && npm run build`. Expect 119 tests passing and 5 skipped (hardware-only) on `claude/circuit-controller`.
- Dev server: `cd apps/web && npx vite --port 5173`. React StrictMode is on. **Don't put `useStudioActions()` functions in effect dependency arrays**: they're new each render and caused infinite loops twice. Restore once-only state before the first render (see `LAST_TAB_KEY` in `useStudioStore.ts`).
- For browser checks, Playwright is preinstalled (`require('playwright')`). Fake Web MIDI with an init script that replaces `navigator.requestMIDIAccess`, as described above. For audio, use `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`.
- `apps/web/tsconfig.tsbuildinfo` is tracked in git and changes on build. That's harmless, but it shows up in diffs.
