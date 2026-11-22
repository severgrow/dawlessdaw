# Setup on macOS (Chrome) — Dawlessdaw

## Requirements

- macOS with Node.js 20+ (22 recommended)
- Google Chrome (Web MIDI)
- USB: Circuit Rhythm + M-VAVE FM1 (**H-1** / Felucca) minimum for FM1 jam; MPC One / SP-404MKII optional
- ZED-10FX on USB for audio only
- Hardware MIDI thru (optional): Circuit MIDI Out → MIDI thru → MPC MIDI In + SP MIDI In
  - Thru forwards **all** Circuit MIDI (notes + ch16 PGM + clock), not just clock
  - FM1 is USB notes only (Circuit T5+T6 → FM1 ch5+ch6; no DIN clock required)

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

### White screen after `git pull` (Vite still running)

If Chrome shows a blank page after pulling (especially after package merges), stop the
dev server, clear Vite’s transform cache, and restart:

```bash
git checkout main
git pull origin main
# stop npm run / vite (Ctrl-C)
rm -rf apps/web/node_modules/.vite
npm run dev:fresh
```

Then hard-refresh Chrome (Cmd+Shift+R). Typical console clue:
`does not provide an export named '…'` from `@dawlessdaw/devices` — stale barrel, not bad source.

1. Start in Simulation to confirm the UI loads.
2. Click **Switch to Live** and allow MIDI access.
3. Open **Patchbay → Ports** — this is the raw Chrome list. Expect Circuit, SP-404, and often **Felucca** (FM1 CDC name). If **MPC One** is missing here, open **Audio MIDI Setup** first — if MIDI Studio has no MPC, the app cannot help. Then unplug/replug, quit competing DAWs/MPC software, and use **Rescan MIDI ports**. Full checklist: [mpc-one-mac-midi-missing.md](./mpc-one-mac-midi-missing.md).
4. Open **Settings** — confirm port assignments. Felucca should auto-assign to **FM1**; if not, pick Felucca manually for FM1 in/out. Review the channel plan.
5. Click **Re-apply My Studio routes** (USB remaps: Circuit 5→FM1 5, 6→FM1 6; 1–4→MPC 9–12 optional). Route detail shows source→dest channels (identity remap shows as `ch 5` / `ch 6`). MPC can stay unplugged for an FM1 jam. **SP:** T6 is no longer USB-routed in this preset.
6. Use **Bench Test** with the gear powered on — include the “close app / clock only” step.
7. Use **Section Bridge** after Project PGM bench looks good (SP PC ch13, MPC PC ch15).

## Tests

```bash
npm test
npm run build
```

## Hardware checklist before Bench Test

1. **Circuit:** Note Tx ON, Program Change Tx ON, Clock Tx ON (for the thru box). USB to Mac.
2. **MPC:** MIDI In from the **Scarlett 2i4 MIDI Out** (not the thru box); listen to **ch9–12** for Circuit tracks 1–4 notes; mute Learn = **CC 20 on channel 15** (not 16). Full steps: [mpc-via-scarlett.md](./mpc-via-scarlett.md).
3. **SP-404MKII (optional):** USB to Mac; MIDI In from thru box. My Studio does **not** USB-route Circuit T6 to SP; Bridge/Bench pattern PC still uses **ch13**.
4. **FM1 (H-1):** USB to Mac; listen on **ch5 + ch6** (or remap both to ch5 if H-1 is single-channel). Profile **h-1**. Treat as generic MIDI until Bench Pass. Do not flash firmware or send SysEx from the app.
5. **ZED:** USB audio only — ignore for MIDI benches.
6. App clock: turn on **Circuit clock → MPC** (the MPC is off the thru box). Leave **→ SP** off while the SP is on the thru box.
7. Sanity: **close the app**, play Circuit → the SP follows tempo; the MPC does nothing (it only hears the app).

For the numbered Live + Bench walkthrough, see [live-run-guide.md](./live-run-guide.md).
