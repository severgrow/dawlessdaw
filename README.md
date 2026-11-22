# Dawlessdaw

Local-first web app for hardware music studio connectivity (Mac + Chrome + Web MIDI).

Formerly prototyped as NervOS. This repository is the source of truth.

## Quick start (macOS + Chrome)

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
npm install
npm run dev
```

Open **http://localhost:5173**. Default mode is Simulation. Click **Switch to Live** and allow MIDI when your Circuit / MPC / SP-404 / FM1 are on USB.

```bash
npm test
npm run build
```

## Your studio plan (My Studio)

**FM1 jam focus:** Circuit T5–T8 → FM1 running **Skiff** over USB (port often named Felucca); Circuit macro knobs are translated to Skiff's CCs. MPC can take notes over USB or straight from the thru-box cable (Settings → MPC connection). See [docs/skiff-fm1.md](docs/skiff-fm1.md).

**SP-404:** Circuit tracks 1–4 can play SP banks A–D (SP MIDI Mode A), and the **SP-404 Samples** page prepares pad-named WAVs for banks A–D. See [docs/sp404-banks-and-samples.md](docs/sp404-banks-and-samples.md).

| Circuit track | Circuit ch | USB dest channel | Destination |
|---------------|------------|------------------|-------------|
| 5 | 5 | 5 | M-VAVE FM1 **H-1** / Felucca (USB; generic MIDI until bench) |
| 6 | 6 | 6 | M-VAVE FM1 **H-1** / Felucca (same; **not** SP) |
| 1–4 | 1–4 | **9–12** (remap) | MPC One (optional) |
| 7–8 | 7–8 | — | Internal Circuit only |
| Project | 16 | Bridge → SP **ch13** PC · MPC **ch15** PC | Section Bridge (+ optional Scene) |

- If FM1 only listens on one channel, remap both tracks to **ch5** (default is 5→5 / 6→6).
- SP: Circuit T6 is **not** USB-routed in this preset; Bridge/Bench PC still use SP **ch13**.
- MIDI clock: **hardware** Circuit Out → thru → SP. The MPC (now behind the Scarlett 2i4, see [docs/mpc-via-scarlett.md](docs/mpc-via-scarlett.md)) gets clock only when Settings → **Circuit clock → MPC** is on. Every app clock switch (MPC / SP / FM1) is OFF by default.
- MPC mute MIDI Learn: **CC 20 on channel 15** (control channel — not 16).

ZED-10FX: USB **audio only** — no MIDI.

## Docs

See `/docs` in this repo — start with **[docs/live-run-guide.md](docs/live-run-guide.md)** for the Live + Bench checklist, then architecture, setup, hardware-integration research, limitations.

## Honesty

Simulated tests do not prove hardware behaviour. Use **Bench Test** with real gear and export the JSON for follow-up. FM1 H-1 capabilities stay **unknown** until Bench Pass — do not assume Open or stock CC maps.
