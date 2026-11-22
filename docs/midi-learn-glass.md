# MIDI learn glass

Dark frosted-glass overlay that opens when you twist a Circuit **macro** or **mixer Level/Pan**.

## Try it

1. Open Dawlessdaw in Chrome with Web MIDI allowed.
2. Connect Circuit Rhythm (any tab is fine — glass is global).
3. Select a track on the Circuit and twist a macro, or open Mixer view and turn Level/Pan (CC Tx ON).
4. Popup shows source → current routing; change device / param; **Save** or **Cancel**.
5. Optional: **pin**, or **10s** to snooze.

## Per-track vs global

| Scope | What |
|---|---|
| **Per track** | Destination device + slot, first-note shift, all 8 macro targets, mixer Level/Pan follow that track’s dest |
| **Global** | Glass UI prefs (snooze timer, pin while open); built-in / saved presets; Skiff channel table |

Clock / start / stop / SysEx never open the glass. Circuit buttons do not send MIDI.

