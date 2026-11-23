# Phase 3 — deeper SP-404MKII integration

**Status: experimental** until Patryk confirms on hardware. Never write pads over USB. Never flash firmware. The only write path is new WAV files into SD `IMPORT/` (existing grant flow).

## What this phase adds

1. **Sounds → SP-404** — setup checklist (Mode A vs B in plain words, receive channels, clock external) + live Note/CC/PC/Clock ticks toward SP out.
2. **Name effect knobs by ear** — guided sweep of CTRL CC 16–19 / 80–83; save labels to a local SP effect profile. Stays **untested** until owner marks verified.
3. **Pad names** — SD scan shows source + scan time; pad grid lights the playing pad from Mode A notes Splot sends.
4. **Circuit → SP pad map** — visual pads + learn-first-note walk on Controller tracks that target SP.
5. **Song sections** — optional Mode A bank for pattern PC (bank channel 1–10). Legacy ch13 bridge kept. Bench unverified until confirm.
6. **Send to SP** — Sessions / samples → 48 kHz 16-bit WAV → `IMPORT/` + pad picker; on-device **SHIFT + pad 14 Import** (Roland manual / check the manual).
7. **USB Browse** — read-only allow-list (unit-tested write/erase block). FW **5.51** known-good; **5.52** needs explicit OK checkbox (ask before treating as fine).
8. **DOOM OS** — note only when DOOM profile selected; no DOOM writes.

## Citations

- Roland SP-404MKII MIDI Implementation (Mode A, effect CTRL CCs)
- Roland Reference Manual — Import
- [sp404-usb-protocol.md](./sp404-usb-protocol.md) (open404 MIT; FW 5.51)

## Hardware checklist (owner)

1. Settings → Ports: SP out assigned. Sounds → SP-404: work the checklist.
2. Mode A on the SP. Play Circuit notes into T7/T8 — live Note ticks + pad lights.
3. Effect-by-ear: Sweep all CTRL CCs → name knobs → leave verified **off** until sure.
4. Song sections: set SP bank A + pattern; change Circuit Project — confirm pattern change (or mark Unsure).
5. Sessions: Write to IMPORT → eject → SHIFT+pad 14 Import on the named pad.
6. Optional USB browse (`?spUsb=1`): backup SD; FW 5.51 preferred; 5.52 only with the OK checkbox.

## Tests

`packages/devices` sp404-setup / sp-effect-names; section bridge Mode A bank PC; `apps/web` USB allow-list write/erase block. They do **not** prove hardware.
