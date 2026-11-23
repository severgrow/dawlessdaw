# Audio fidelity — hardware Bench protocol (P8)

**Status:** doc only until Patryk is home · **experimental** until Bench pass  
**Gear:** Allen & Heath ZED-10FX · Focusrite Scarlett (2i2 / 2i4) · never MacBook / iPhone / Continuity mic

## Goal

Confirm Session Recorder + FLIP capture stay dry (no AGC/NS/AEC), levels match the interface, and WAV round-trips without fake bit-depth claims.

## Prep

1. Plug Scarlett or ZED USB into the Mac. Prefer headphones on the interface.
2. Open Splot → Sessions (or FLIP). Input picker should list the interface; built-ins must stay hidden.
3. Set interface gain so peaks sit below clip on the hardware meters.

## Steps (numbered)

1. **Select interface** — Sessions input → Scarlett / ZED only. Confirm MacBook mic is absent.
2. **Dry check** — Record 5 s of a steady tone or metronome into the interface. Monitor input stays **OFF** unless you intentionally listen on headphones.
3. **Clip hold** — Briefly overload the input; clip LEDs in Splot should latch ~2 s then clear.
4. **Save** — Stop → take appears. Kill the tab mid-record once (draft recovery): reopen Sessions — recovered take or intact draft; never a silent empty take after a failed save.
5. **WAV 32-float** — Export float32 WAV; reopen in a DAW — level should match (±0.1 dB ear).
6. **WAV 24 + dither** — Export 24-bit; quiet passages should not show stair-stepping vs float (TPDF dither on).
7. **FLIP gain** — Capture a 1-bar loop, set Gain to 200%, play once. Level should rise once (not 4×). Export WAV and confirm same gain, not double.
8. **MP3 honesty** — Export “V0”: file is **320 kbps CBR** (lamejs cannot VBR) — label is a stand-in, not true V0.

## Pass / fail

| Check | Pass |
|-------|------|
| Built-in mic never selectable | ✓ |
| Monitor default OFF | ✓ |
| Recovery survives failed save | ✓ |
| FLIP gain applied once | ✓ |
| No “24-bit from getUserMedia” claim | ✓ |

Mark Bench results **verified** only after Patryk confirms on the real rig.
