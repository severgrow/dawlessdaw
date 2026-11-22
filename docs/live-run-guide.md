# Live + Bench checklist (your gear)

Plain-English steps for Patryk’s studio. Nothing here marks hardware as verified — only **Bench Test → Pass** does that.

## What you have plugged in

| Gear | Role |
|------|------|
| Novation Circuit Rhythm | Arranger / clock master (thru box) |
| Akai MPC One | Tracks 1–4 (MIDI ch 1–4) |
| M-VAVE FM1 on **H-1** firmware | Track 5 (MIDI ch 5) — notes (+ knobs CC 20–23 per H-1 docs) |
| Roland SP-404MKII | Track 6 (MIDI ch 6) |
| Circuit tracks 7–8 | Stay on Circuit only |
| Allen & Heath ZED-10FX | **Audio only** — ignore for MIDI |

**Clock:** Circuit MIDI Out → thru box → MPC MIDI In + SP MIDI In. App clock stays **OFF**. FM1 does not need clock for this plan.

**FM1 H-1 note:** This is community firmware ([jakehandy/h1](https://github.com/jakehandy/h1)), **not** FM1 Open and **not** stock. Dawlessdaw must not assume Open CC maps. Do not flash or send SysEx from the app.

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
5. Click **Re-apply My Studio routes**.

## 4. Bench Test (mark honestly)

Open **Bench Test**. For each item, play the hardware and mark Pass / Fail / Unsure. Export JSON when done.

Suggested order:

1. Circuit notes appear in the app (Live RX).
2. Circuit track 1–4 notes reach the MPC (ch 1–4).
3. Circuit track 5 notes reach the FM1 (ch 5) — you should hear H-1.
4. Optional: twist FM1 knobs and see if CC 20–23 show in the bench (H-1 docs claim this; still untested until Pass).
5. Circuit track 6 notes / pattern changes on the SP.
6. Tracks 7–8 stay on Circuit only.
7. Clock: MPC + SP follow Circuit via the thru box (not the app).
8. Section Bridge: Circuit Project change (ch16 PGM) only after the above looks good.

**Do not** enable app clock unless you deliberately want a second clock path.

## 5. After the bench

- Export the Bench JSON and keep it with your session notes.
- Only treat a feature as verified when its row is **Pass**.
- ZED stays audio-only — no MIDI checklist for it.
