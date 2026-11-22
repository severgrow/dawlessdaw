# Setup on macOS (Chrome) — Dawlessdaw

## Requirements

- macOS with Node.js 20+ (22 recommended)
- Google Chrome (Web MIDI)
- USB: Circuit Rhythm, MPC One, SP-404MKII, M-VAVE FM1 (**H-1** firmware — not Open)
- ZED-10FX on USB for audio only
- Hardware MIDI: Circuit MIDI Out → MIDI thru → MPC MIDI In + SP MIDI In
  - Thru forwards **all** Circuit MIDI (notes + ch16 PGM + clock), not just clock
  - FM1 is USB notes only (no DIN clock required for this plan)

## Install & run

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git checkout phase-2-live-bench   # or main after merge
npm install
npm run dev
```

If `npm install` fails with `Cannot find module @rollup/rollup-darwin-arm64` (npm optional-deps flake on Apple Silicon):

```bash
rm -rf node_modules package-lock.json && npm install
```

Then pull again later so you pick up the lockfile that already lists the darwin rollup/esbuild binaries. Prefer a fresh clone/pull of this branch over deleting the lockfile when the fixed lockfile is available.

Open **http://localhost:5173**.

1. Start in Simulation to confirm the UI loads.
2. Click **Switch to Live** and allow MIDI access.
3. Open **Settings** — confirm port assignments (fix if a name match is wrong) and review the channel plan.
4. Click **Re-apply My Studio routes** (USB remaps: Circuit 1–4→MPC 9–12, 5→FM1 5, 6→SP 13).
5. Use **Bench Test** with the gear powered on — include the “close app / clock only” step.
6. Use **Section Bridge** after Project PGM bench looks good (SP PC ch13, MPC PC ch15).

## Tests

```bash
npm test
npm run build
```

## Hardware checklist before Bench Test

1. **Circuit:** Note Tx ON, Program Change Tx ON, Clock Tx ON (for the thru box). USB to Mac.
2. **MPC:** USB to Mac; MIDI In from thru box; listen to **ch9–12** for Circuit tracks 1–4 notes; in MIDI/Sync enable the Mac/Dawlessdaw port for **Control**; mute Learn = **CC 20 on channel 15** (not 16).
3. **SP-404MKII:** USB to Mac; MIDI In from thru box; pattern/notes on **ch13**.
4. **FM1 (H-1):** USB to Mac; no clock expected. Profile **h-1**. Treat as generic MIDI until Bench Pass. Do not flash firmware or send SysEx from the app.
5. **ZED:** USB audio only — ignore for MIDI benches.
6. Do **not** enable app clock forwarding in Settings unless you intentionally want a second clock path.
7. Sanity: **close the app**, play Circuit → MPC + SP follow tempo but play **no** notes.

For the numbered Live + Bench walkthrough, see [live-run-guide.md](./live-run-guide.md).
