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

Routing lives on the **Controller** tab (see [docs/circuit-controller.md](docs/circuit-controller.md)). Locked decisions: [docs/DECISIONS.md](docs/DECISIONS.md). Circuit **Mixer** Level (CC29) / Pan (CC30) also remap to destination Volume/Pan (CC7/CC10) on each routed track — see [docs/skiff-fm1.md](docs/skiff-fm1.md).

**FM1 / Skiff:** Circuit T5–T8 → Skiff tracks 1–4 over USB (port often named Felucca). App out channels **1–4** (Skiff default) — set FM1 MENU › MIDI › T1–T4 CHANNEL to match. Macro knobs → Brightness…Reverb + **Level**. See [docs/skiff-fm1.md](docs/skiff-fm1.md).

**SP-404:** Circuit T1–T4 → SP banks A–D (MIDI Mode A), first-note learn on the Controller. Samples tab prepares pad WAVs. See [docs/sp404-banks-and-samples.md](docs/sp404-banks-and-samples.md).

| Circuit | Destination (My Studio) |
|---------|-------------------------|
| T1–T4 | SP banks A–D **or** MPC tracks 1–4 (ch 9–12 via Scarlett) |
| T5–T8 | Skiff tracks 1–4 (app → FM1 ch 1–4) |
| Project / Sections | Section Bridge → SP **ch13** PC · MPC **ch15** PC |

- MIDI clock: **hardware** Circuit Out → thru → SP. The MPC (Scarlett DIN — [docs/mpc-via-scarlett.md](docs/mpc-via-scarlett.md)) gets clock only when Rig → Tempo → **→ MPC** is on. App clock switches default OFF.
- MPC mute MIDI Learn: **CC 20 on channel 15** (control channel — not 16).

ZED-10FX: USB **audio only** — no MIDI.

## Docs

See `/docs` — start with **[docs/live-run-guide.md](docs/live-run-guide.md)**, then [circuit-controller.md](docs/circuit-controller.md), architecture, setup, limitations. Agent context: [docs/HANDOVER.md](docs/HANDOVER.md).

## Honesty

Simulated tests do not prove hardware behaviour. Use the **Test** tab with real gear and export the JSON for follow-up. FM1 H-1 capabilities stay **unknown** until Bench Pass — do not assume Open or stock CC maps.
