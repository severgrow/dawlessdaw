# Live + Bench checklist (your gear)

Plain-English steps for Patryk’s studio. Nothing here marks hardware as verified — only **Bench Test → Pass** does that.

## What you have plugged in

| Gear | Role |
|------|------|
| Novation Circuit Rhythm | Arranger / clock master (thru box) |
| Akai MPC One | Tracks 1–4 via USB remap **ch9–12** (not 1–4) |
| M-VAVE FM1 on **H-1** firmware | Track 5 (MIDI ch 5) — generic MIDI until Bench Pass |
| Roland SP-404MKII | Track 6 via USB remap **ch13** |
| Circuit tracks 7–8 | Stay on Circuit only |
| Allen & Heath ZED-10FX | **Audio only** — ignore for MIDI |

**Thru box:** Circuit MIDI Out → thru → MPC MIDI In + SP MIDI In. The thru carries **all** Circuit MIDI (notes 1–8 + ch16 PGM + clock), not just clock. App clock stays **OFF**. USB remaps avoid doubled notes on MPC/SP.

**FM1 H-1 note:** Community firmware ([jakehandy/h1](https://github.com/jakehandy/h1)), **not** FM1 Open and **not** stock. Dawlessdaw treats H-1 as **generic MIDI** with every capability **unknown/untested** until Bench Pass. Do not assume Open/stock CC maps. Do not flash or send SysEx from the app.

---

## 1. Power and cables

1. Power on Circuit, MPC, SP-404, FM1, ZED.
2. USB: Circuit, MPC, SP-404, FM1 → MacBook. ZED USB if you want audio later.
3. DIN: Circuit Out → thru → MPC In + SP In.
4. Audio: each device into the ZED as you normally mix (no MIDI on ZED).

## 2. Run Dawlessdaw on the Mac

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git checkout phase-2-live-bench
npm install
npm run dev
```

If install errors with `Cannot find module @rollup/rollup-darwin-arm64`:

```bash
rm -rf node_modules package-lock.json && npm install
```

(Prefer `git pull` of this branch first — the lockfile now includes darwin optional binaries.)

If GitHub is still empty, use the Phase 2 bundle instead:

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git fetch /path/to/dawlessdaw-phase-2.bundle 'refs/heads/*:refs/heads/*'
git checkout phase-2-live-bench
npm install
npm run dev
```

Open **http://localhost:5173** in **Chrome**.

## 3. Live mode

1. Confirm the UI loads in Simulation.
2. Click **Switch to Live** → allow MIDI.
3. Open **Settings** — check Circuit / MPC / SP / FM1 ports. Fix any wrong name match.
4. Confirm FM1 firmware shows **H-1** (or set it). Leave app clock forwarding **off**.
5. Click **Re-apply My Studio routes** (ch1–4→MPC 9–12, ch5→FM1 5, ch6→SP 13).

### Mac troubleshooting — Device Strip says NOT CONNECTED

The strip shows **CONNECTED** only when that gear has a **port assignment** (auto-match or manual). LIVE MIDI can be on while MPC / FM1 still show NOT CONNECTED if Chrome’s port name did not match hints.

**Do this first (while waiting for an update):**

1. Open **Settings → All Web MIDI ports (raw)**.
2. **Copy/paste every port name** listed there (inputs and outputs), including odd ones like `CH345`, `USB-MIDI`, `Akai Professional …`, `IAC Driver…`.
3. If you see a name that is clearly the MPC or FM1, use the **In / Out** dropdowns under Port assignments to attach it, then **Re-apply My Studio routes**.
4. If MPC / FM1 USB cables are plugged in but **no extra ports appear at all**, this is OS/Chrome/hardware — not app matching:
   - Open **Audio MIDI Setup → Window → Show MIDI Studio**; confirm the devices appear and are online.
   - Unplug USB → wait 3 s → replug (powered hub if you use one).
   - Quit Chrome fully (⌘Q) and reopen; click **Switch to Live** and allow MIDI again.
   - Try another USB port / cable; avoid unpowered daisy-chains for MPC + SP + Circuit + FM1.

Common Mac Chrome names:

| Gear | Names you may see |
|------|-------------------|
| MPC One | `MPC One`, `Akai Professional MPC One`, sometimes Port 1 / Port 2 |
| FM1 (H-1) | `M-VAVE FM1`, `M-VAVE`, `MVAV`, or generic `CH345` / `USB-MIDI` (WCH CDC) — may **not** contain `fm1` |
| Circuit / SP | Usually contain `Circuit` / `SP-404` — leave those alone when assigning MPC/FM1 |

Manual assign beats auto-match and is saved on this Mac.

## 4. Bench Test (mark honestly)

Open **Bench Test**. For each item, play the hardware and mark Pass / Fail / Unsure. Export JSON when done.

Suggested order:

1. Circuit notes appear in the app (Live RX on ch 1–8).
2. Circuit track 1–4 notes reach the MPC on **ch9–12** (USB remap).
3. Circuit track 5 notes reach the FM1 (ch 5) — generic H-1 until you mark Pass.
4. Optional: twist FM1 knobs — community docs claim CC 20–23; mark Unsure/Fail until proven (do not assume Open maps).
5. Circuit track 6 notes reach the SP on **ch13**.
6. Tracks 7–8 stay on Circuit only.
7. **Close the app, play the Circuit: MPC and SP should follow tempo but play no notes.** (Thru-box clock without USB remapped notes.)
8. Mute Learn: CC 20 on **channel 15** (not 16).
9. Section Bridge: Circuit Project change (ch16 PGM) → SP PC **ch13** / MPC PC **ch15** only after the above looks good.

**Do not** enable app clock unless you deliberately want a second clock path.

## 5. After the bench

- Export the Bench JSON and keep it with your session notes.
- Only treat a feature as verified when its row is **Pass**.
- ZED stays audio-only — no MIDI checklist for it.
