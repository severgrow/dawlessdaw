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

| Circuit track | MIDI ch | Destination |
|---------------|---------|-------------|
| 1–4 | 1–4 | MPC One |
| 5 | 5 | M-VAVE FM1 (notes only, no clock) |
| 6 | 6 | SP-404MKII |
| 7–8 | 7–8 | Internal Circuit only |
| Project | 16 | Section Bridge (optional SP/MPC PC + Scene) |

MIDI clock: **hardware** Circuit Out → thru box → MPC + SP. App clock forwarding is OFF by default.

ZED-10FX: USB **audio only** — no MIDI.

## Docs

See `/docs` in this repo (architecture, setup, hardware-integration research, limitations).

## Honesty

Simulated tests do not prove hardware behaviour. Use **Bench Test** with real gear and export the JSON for follow-up.
