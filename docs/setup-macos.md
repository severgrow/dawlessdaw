# Setup on macOS (Chrome) — Dawlessdaw

## Requirements

- macOS with Node.js 20+ (22 recommended)
- Google Chrome (Web MIDI)
- USB: Circuit Rhythm, MPC One, SP-404MKII, M-VAVE FM1
- ZED-10FX on USB for audio only
- Hardware MIDI: Circuit MIDI Out → MIDI thru → MPC MIDI In + SP MIDI In (FM1 gets notes only, no clock)

## Install & run

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git checkout phase-2-live-bench   # or main after merge
npm install
npm run dev
```

Open **http://localhost:5173**.

1. Start in Simulation to confirm the UI loads.
2. Click **Switch to Live** and allow MIDI access.
3. Open **Settings** — confirm port assignments (fix if a name match is wrong).
4. Click **Re-apply My Studio routes**.
5. Use **Bench Test** with the gear powered on.
6. Use **Section Bridge** after Project PGM bench looks good.

## Tests

```bash
npm test
npm run build
```

## Hardware checklist before Bench Test

1. **Circuit:** Note Tx ON, Program Change Tx ON, Clock Tx ON (for the thru box). USB to Mac.
2. **MPC:** USB to Mac; MIDI In from thru box; in MIDI/Sync enable the Mac/Dawlessdaw port for **Control** if testing mute Learn.
3. **SP-404MKII:** USB to Mac; MIDI In from thru box; ready to watch pattern changes.
4. **FM1:** USB to Mac; no clock expected.
5. **ZED:** USB audio only — ignore for MIDI benches.
6. Do **not** enable app clock forwarding in Settings unless you intentionally want a second clock path.
