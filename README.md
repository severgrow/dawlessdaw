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

Thru box forwards **all** Circuit MIDI (notes 1–8 + ch16 PGM + clock) into MPC + SP DIN.
USB routes **remap** so the app does not double those notes:

| Circuit track | Circuit ch | USB dest channel | Destination |
|---------------|------------|------------------|-------------|
| 1–4 | 1–4 | **9–12** (remap) | MPC One |
| 5 | 5 | 5 (unchanged) | M-VAVE FM1 **H-1** (USB only; generic MIDI until bench) |
| 6 | 6 | **13** (remap) | SP-404MKII |
| 7–8 | 7–8 | — | Internal Circuit only |
| Project | 16 | Bridge → SP **ch13** PC · MPC **ch15** PC | Section Bridge (+ optional Scene) |

- MIDI clock: **hardware** Circuit Out → thru → MPC + SP. App clock forwarding OFF by default.
- MPC mute MIDI Learn: **CC 20 on channel 15** (control channel — not 16).
- Bench check: close the app, play Circuit → MPC/SP follow tempo but play **no** notes.

ZED-10FX: USB **audio only** — no MIDI.

## Docs

See `/docs` in this repo — start with **[docs/live-run-guide.md](docs/live-run-guide.md)** for the Live + Bench checklist, then architecture, setup, hardware-integration research, limitations.

## Honesty

Simulated tests do not prove hardware behaviour. Use **Bench Test** with real gear and export the JSON for follow-up. FM1 H-1 capabilities stay **unknown** until Bench Pass — do not assume Open or stock CC maps.
