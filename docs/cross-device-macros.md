# Cross-device macros (Milestone 3)

**Honesty:** **experimental** until Patryk confirms on hardware. Opt-in only. Destination CCs come from the docs-backed catalog (Skiff README, Roland SP effect CTRL chart, MPC learnable CCs) — not free-form custom CCs in the default UI.

## What it does

| Piece | Behaviour |
|-------|-----------|
| **Super Macros** | One Circuit macro (CC 21–28) → many destinations (device / ch / CC / min / max / curve / invert / enabled) |
| **Soft takeover** | Direct / Pickup / Relative; UI shows **last-sent** (Splot) vs **device state: unknown** |
| **A/B Macro Scenes** | Capture / morph with duration + curve; optional bar-quantised start; cancel. **Splot-owned** — not Circuit Scenes |
| **Traffic protection** | Max Hz / dest, coalesce, output monitor, panic/disable |
| **MIDI Learn** | Existing Controller single-destination Learn unchanged |

## Where

Settings → **Macros**. Persisted in `localStorage` key `dawlessdaw.superMacros.v1`.

## Engine

`SuperMacroEngine` in `@dawlessdaw/devices`. Host (`StudioRuntime`) sends CCs after Controller routing — additive fan-out when a Super Macro is enabled.

## Hardware checklist (Patryk)

1. Settings → Macros → Add Super Macro → enable → add e.g. FM1 Brightness + SP Effect control 1.
2. Source = T1 knob 1. Twist Circuit T1 macro 1 — both should move (if outs assigned).
3. Set takeover Pickup on one dest; move elsewhere in the app’s last-sent, latch, twist until it catches.
4. Capture A / B, Morph → B (with Circuit playing if bar-quantize on).
5. Panic — Super Macro CCs stop; Controller Learn routes still work.
6. Confirm no unexpected flood (watch Output monitor + gear).

## Limits

Device parameter state is not read back over MIDI — only last-sent is known. Rate limits are main-thread approximate.
