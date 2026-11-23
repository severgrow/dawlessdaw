# Splot MIDI Brain

Local-first web app for hardware music studio connectivity (Mac + Chrome + Web MIDI).

**About:** Splot is Polish for weaving things together. Splot weaves your hardware into one instrument.

Formerly prototyped as NervOS / dawlessdaw. This repository is the source of truth. Package and folder names still use `dawlessdaw` for now.

## Quick start (macOS)

**Desktop app (recommended):** download the latest **Splot MIDI Brain** `.dmg` from [GitHub Releases](https://github.com/severgrow/dawlessdaw/releases), drag to Applications, open once (Right-click → Open if Gatekeeper warns). The app auto-checks for updates from Releases — no Terminal/`npm` each time.

**Dev (Chrome):**

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
npm install
npm run dev
```

Open **http://localhost:5173**. Allow MIDI when your Circuit / MPC / SP-404 / FM1 are on USB.

```bash
npm run build:desktop   # Vite build with relative paths for the Electron shell
npm run desktop         # run the desktop shell against that build (dev machine)
```

```bash
npm test          # unit tests (Vitest)
npm run build
npm run smoke     # headless Chrome: open built app, keys 1–8, fail on blank/error
```

## Your studio plan (Ploe Live v1 — default)

Routing lives on the **Controller** tab (see [docs/circuit-controller.md](docs/circuit-controller.md)). The default built-in preset is **Ploe Live v1** (older **My Studio** presets stay in the list). The **Sequencer** tab is an 8×16 pattern grid that reuses those destinations — see [docs/sequencer.md](docs/sequencer.md). Locked decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

**Ploe Live v1 (verified path 22 Nov 2026):**

| Circuit | Destination |
|---------|-------------|
| T1–T4 | MPC tracks 1–4 (ch 9–12 via Scarlett MIDI Out → DIN) |
| T5–T6 | Skiff tracks 1–2 (USB / Felucca) |
| T7–T8 | SP banks A–B (change Bank on Controller anytime) |

**My Studio** variants remain available: T1–T4 → SP A–D **or** MPC, T5–T8 → Skiff 1–4.

- MIDI clock: **hardware** Circuit Out → thru → SP. The MPC (Scarlett DIN — [docs/mpc-via-scarlett.md](docs/mpc-via-scarlett.md)) gets app clock only when Rig → Tempo → **→ MPC** is on. App clock switches default OFF.
- MPC mute MIDI Learn: **CC 20 on channel 15** (control channel — not 16).

ZED-10FX: USB **audio only** — no MIDI. Use the **Sessions** tab to record stereo from ZED / Scarlett / SP / any input (local takes only). See [docs/session-recorder.md](docs/session-recorder.md).

## Docs

See `/docs` — start with **[docs/live-run-guide.md](docs/live-run-guide.md)**, then [circuit-controller.md](docs/circuit-controller.md), [session-recorder.md](docs/session-recorder.md), [circuit-deep-sync.md](docs/circuit-deep-sync.md), [universal-ux-slice.md](docs/universal-ux-slice.md), architecture, setup, limitations. Agent context: [docs/HANDOVER.md](docs/HANDOVER.md). First full-rig bench narrative: [docs/bench-results/2026-11-22-first-full-rig.md](docs/bench-results/2026-11-22-first-full-rig.md).

## Honesty

Simulated tests do not prove hardware behaviour. Use the **Test** tab with real gear and export the JSON for follow-up. FM1 H-1 capabilities stay **unknown** until Bench Pass — do not assume Open or stock CC maps.
