# F — Hardware connection plan

User gear: MPC One · SP-404MKII · Circuit Rhythm · M-VAVE FM1 · ZED-10FX · Mac (Dawlessdaw / Chrome).

## What works with current hardware (no extra interfaces)

Assume Mac has enough USB ports or a **passive USB hub** (class-compliant devices).

| Link | Purpose | Status |
|------|---------|--------|
| Circuit USB → Mac | MIDI in/out + Components | Works (Web MIDI) |
| MPC USB → Mac | MIDI in/out | Works |
| SP-404MKII USB → Mac | MIDI (+ official app / community USB) | MIDI works; CDC librarian needs native sidecar later |
| FM1 USB → Mac | MIDI | Works |
| ZED USB → Mac | Stereo audio I/O only | Works; **no MIDI** |
| Device audio outs → ZED inputs | Mix / monitor / FX | Physical only |
| SP to ZED Aux/FX send-return | SP as insert/FX | Physical AUX/FX on ZED — Confirmed in ZED guide |

**Dawlessdaw role:** MIDI brain on Mac. **ZED role:** analogue sum + USB record bus.

## Recommended clock

Pick one leader:

1. **Circuit as arranger + clock** (default for eight-track plan): Circuit Clock Tx on; MPC/SP Clock Rx / remote; Dawlessdaw `clockAuthority` = Circuit in-port.
2. **MPC as master:** reverse clock; Circuit Clock Rx on, Tx off.

Never enable Clock Tx on multiple devices.

## MIDI Thru / DIN (this studio)

This studio’s thru box forwards **all** Circuit MIDI (notes on tracks 1–8, ch16 Program Change, and clock) into MPC + SP DIN — not clock alone.

Dawlessdaw therefore **remaps** USB note routes so they do not double with the thru path:

| Circuit | USB remap | Target |
|---------|-----------|--------|
| ch 5 | → 5 | FM1 / Felucca (USB) |
| ch 6 | → 6 | FM1 / Felucca (USB; **not** SP in this preset) |
| ch 1–4 | → **9–12** | MPC (optional — no-op when absent) |
| ch 16 Project | observed only | Section Bridge → SP PC **ch13**, MPC PC **ch15** (never 1–8 or 16) |

Mute Learn target: **CC 20 on MPC control channel 15**.

Sanity check: close the app, play Circuit → MPC/SP follow tempo but play **no** notes.

USB vs DIN timing/filter differences: **Hardware testing required**.

## Extra hardware only if needed

| Need | Extra |
|------|-------|
| More USB ports | Powered hub |
| DIN-only FM1/MPC routing without USB MIDI | MIDI interface / merge |
| Low-latency native SP librarian | Not required for Dawlessdaw MIDI PoC |
| Hardware MIDI merge without computer | MIDI merge box |

## Audio sketch

```
MPC L/R ──► ZED ch
SP L/R  ──► ZED ch (or FX send/return)
Circuit L/R ► ZED ch
FM1 L/R ──► ZED ch
ZED USB ──► Mac (record/monitor)
ZED Main ► monitors
```

Dawlessdaw does **not** move ZED faders.
