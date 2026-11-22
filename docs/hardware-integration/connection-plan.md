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

## MIDI Thru / DIN

Optional if you want hardware failover without Mac:

- Circuit MIDI Out → MPC MIDI In (direct sequencing) **or**
- Keep all USB-to-Mac and let Dawlessdaw route (flexible, Mac must be on).

USB vs DIN: same message classes when Tx enabled; **Hardware testing required** for any timing/filter differences.

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
