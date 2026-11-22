# MPC One missing from macOS / Web MIDI

**Honest gate:** If **Audio MIDI Setup → MIDI Studio** has no MPC icon (or it stays offline), Chrome Web MIDI cannot see it and **Dawlessdaw cannot invent the port**. Fix the OS first; the app only lists what `navigator.requestMIDIAccess()` returns.

Dawlessdaw’s Patchbay **Ports** / Settings **All Web MIDI ports (raw)** are that exact browser list. No port there ⇒ Device Strip shows **no Web MIDI port**.

Expected Mac name when it works: often **`MPC One MIDI In` / `MPC One MIDI Out`** (sometimes `Akai Professional MPC One`).

---

## Ranked Mac checklist (do in order)

### 1. Audio MIDI Setup (first)

1. Spotlight → **Audio MIDI Setup** → **Window → Show MIDI Studio**.
2. Click **Rescan MIDI**.
3. Confirm an **MPC One** (or Akai) icon appears and is **online** (not grayed).
4. If you previously deleted the icon, Rescan again — macOS will not show a deleted device until rescanned.

**If still missing → continue. If present but Dawlessdaw empty → jump to step 6.**

### 2. Power, cable, direct USB (you already tried direct — still verify)

1. MPC powered on (not asleep / blank).
2. **Data** USB cable (charge-only cables enumerate nothing).
3. MacBook **USB-C port direct** — skip hubs/dongles for this test (hubs flake; Circuit/SP working on the same hub does not prove the MPC link).
4. Unplug → wait ~5 s → replug; try the other MacBook port.
5. On original MPC One: Mac ↔ **USB-B** on the MPC (device port), not USB-A host ports meant for controllers/drives.

### 3. Standalone vs Controller mode

| Mode | What you see | USB MIDI to Chrome |
|------|----------------|--------------------|
| **Standalone** | Normal MPC UI | Class-compliant ports can appear as `MPC One MIDI In/Out` when the unit enumerates as a USB device |
| **Controller** | “Looking for computer” | Meant for **MPC desktop software** + matching driver/firmware — not a reliable Dawlessdaw path |

For Dawlessdaw: stay in **Standalone**. Exit Controller mode if you entered it. Quit **MPC** / **MPC Beats** on the Mac so they are not claiming the USB device.

### 4. MPC MIDI / Sync ports (on the unit)

**Menu → Preferences → MIDI / Sync** (wording varies by MPC 2 vs 3):

1. Prefer **Enable MIDI ports when discovered** / **Track enable ports when discovered** = **On** so newly seen computer ports get Track.
2. Find the **computer / USB / Mac** input (not only DIN **MPC**, not only **Remote**).
3. Enable **Control** (and Track if you want notes on that port) for that computer port — needed for Dawlessdaw → MPC Learn / notes.
4. Do **not** confuse **Remote** (Akai Network MIDI / Wi‑Fi–Ethernet DAW remote) with the USB cable name in Chrome.

DIN **MPC** Global/Track/Sync is for the thru-box clock/notes path — orthogonal to whether the Mac sees USB MIDI.

### 5. Exclusive apps / tabs

1. Quit **Ableton**, **Logic**, **MPC software**, other DAWs.
2. Close other Chrome tabs that used Web MIDI (MIDI Monitor pages, etc.), then **⌘Q** Chrome fully and reopen.
3. On macOS, CoreMIDI usually shares devices; on Windows Chrome can exclusive-lock — still restart Chrome after heavy MIDI use. If Audio MIDI Setup shows the MPC but one app “owns” behavior, quit that app first.

### 6. Chrome / Dawlessdaw only (OS already sees MPC)

1. Site permission: address bar → allow **MIDI** for `localhost`.
2. **Switch to Live** (not Simulation).
3. **Settings → Rescan MIDI ports** (re-requests Web MIDI access and refreshes the list).
4. Confirm **Patchbay → Ports** shows `MPC One MIDI In/Out`.
5. If the name is odd, assign it manually under Settings → Port assignments → MPC.

### 7. FM1 also vanishing sometimes

Same class of USB enumeration flakiness (especially cheap CDC / `Felucca` / `CH345` names). Treat intermittent FM1 + missing MPC as **USB power/enumeration** until both stay solid in MIDI Studio with only those two plugged in.

---

## What Dawlessdaw cannot fix

- No MPC in Audio MIDI Setup
- Charge-only cable / dead USB-B port / unit in Controller mode waiting for MPC software
- Expecting **Remote** network MIDI without Akai Network Driver + network

DIN thru (Circuit → thru → MPC In) still carries clock/notes to the MPC even when USB MIDI to the Mac is gone — USB is only for the app remap / Learn path.
