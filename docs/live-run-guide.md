# Live + Bench checklist (your gear)

Plain-English steps for Patryk’s studio. Nothing here marks hardware as verified — only **Bench Test → Pass** does that.

## What you have plugged in

| Gear | Role |
|------|------|
| Novation Circuit Rhythm | Arranger / clock master (thru box optional) |
| M-VAVE FM1 on **H-1** firmware (Felucca) | **Tracks 5 + 6** via USB → FM1 **ch5 + ch6** — generic MIDI until Bench Pass |
| Akai MPC One | Optional — Tracks 1–4 via USB remap **ch9–12** when connected |
| Roland SP-404MKII | Optional — **not** on Circuit T6 USB in this preset; Section Bridge / Bench PC still use **ch13** |
| Circuit tracks 7–8 | Stay on Circuit only |
| Allen & Heath ZED-10FX | **Audio only** — ignore for MIDI |

**FM1 jam (default):** Circuit + FM1 USB is enough. MPC / SP can stay unplugged — their My Studio routes no-op until ports are assigned.

**Thru box (optional):** Circuit MIDI Out → thru → MPC MIDI In + SP MIDI In. The thru carries **all** Circuit MIDI (notes 1–8 + ch16 PGM + clock), not just clock. App clock stays **OFF**. USB remaps avoid doubled notes on MPC when connected.

**SP note:** Circuit T6 no longer USB-routes to the SP-404 in My Studio. T5 and T6 both go to FM1.

**FM1 H-1 note:** Community firmware ([jakehandy/h1](https://github.com/jakehandy/h1)), **not** FM1 Open and **not** stock. Dawlessdaw treats H-1 as **generic MIDI** with every capability **unknown/untested** until Bench Pass. Do not assume Open/stock CC maps. Do not flash or send SysEx from the app. Default routing preserves track identity (**5→5, 6→6**). If FM1 / H-1 only listens on one channel, remap both tracks to **ch5**.

---

## 1. Power and cables (FM1 jam)

1. Power on Circuit + FM1 (and ZED for audio). MPC / SP optional.
2. USB: Circuit + FM1 → MacBook. (Add MPC / SP USB later if you want those routes.)
3. Audio: FM1 (and anything else) into the ZED as you normally mix.
4. Optional DIN: Circuit Out → thru → MPC In + SP In.

## 2. Run Dawlessdaw on the Mac

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git checkout phase-2-live-bench
npm install
npm run dev
```

If install errors with `Cannot find module @rollup/rollup-darwin-arm64`:

```bash
rm -rf node_modules package-lock.json && npm install
```

(Prefer `git pull` of this branch first — the lockfile now includes darwin optional binaries.)

If GitHub is still empty, use the Phase 2 bundle instead:

```bash
git clone https://github.com/severgrow/dawlessdaw.git
cd dawlessdaw
git fetch /path/to/dawlessdaw-phase-2.bundle 'refs/heads/*:refs/heads/*'
git checkout phase-2-live-bench
npm install
npm run dev
```

Open **http://localhost:5173** in **Chrome**.

## 3. Live mode — Circuit T5/T6 → FM1

Exact clicks:

1. Confirm the UI loads in Simulation.
2. Click **Switch to Live** → allow MIDI.
3. Open **Settings**.
4. Under **Port assignments**, confirm **FM1** In/Out is **Felucca** (or your FM1 CDC name). If not auto-matched, set **FM1 → Felucca** for both In and Out.
5. Confirm Circuit **In** is assigned. MPC / SP can stay unassigned for an FM1-only jam.
6. Confirm FM1 firmware shows **H-1** (or set it). Leave app clock forwarding **off** unless you are on **USB-only clock**.
7. Click **Re-apply My Studio routes** (ch5→FM1 5, ch6→FM1 6; ch1–4→MPC 9–12 no-op if MPC absent).
8. Play Circuit **track 5** and **track 6** — you should hear FM1.

### Mac troubleshooting — Device Strip says NOT CONNECTED

The strip shows **CONNECTED** only when that gear has a **port assignment** (auto-match or manual). LIVE MIDI can be on while MPC / FM1 still show NOT CONNECTED if Chrome’s port name did not match hints.

**Do this first (while waiting for an update):**

1. Open **Settings → All Web MIDI ports (raw)**.
2. **Copy/paste every port name** listed there (inputs and outputs), including odd ones like `CH345`, `USB-MIDI`, `Akai Professional …`, `IAC Driver…`.
3. If you see a name that is clearly the MPC or FM1, use the **In / Out** dropdowns under Port assignments to attach it, then **Re-apply My Studio routes**.
4. If MPC / FM1 USB cables are plugged in but **no extra ports appear at all**, this is OS/Chrome/hardware — not app matching:
   - Open **Audio MIDI Setup → Window → Show MIDI Studio**; confirm the devices appear and are online. **No MPC there ⇒ Dawlessdaw cannot show it.**
   - Unplug USB → wait 3 s → replug (direct MacBook port for the flaky device).
   - Quit MPC software / Ableton / other MIDI apps; stay in MPC **Standalone** (not Controller / “Looking for computer”).
   - Quit Chrome fully (⌘Q) and reopen; **Switch to Live**; Settings or Patchbay → **Rescan MIDI ports**.
   - Full ranked checklist: [mpc-one-mac-midi-missing.md](./mpc-one-mac-midi-missing.md).

Common Mac Chrome names:

| Gear | Names you may see |
|------|-------------------|
| FM1 (H-1) | `Felucca`, `M-VAVE FM1`, `M-VAVE`, `MVAV`, or generic `CH345` / `USB-MIDI` (WCH CDC) — may **not** contain `fm1` |
| Circuit / SP | Usually contain `Circuit` / `SP-404` — leave those alone when assigning FM1 |
| MPC One | `MPC One`, `Akai Professional MPC One`, sometimes Port 1 / Port 2 (optional for this jam) |

Manual assign beats auto-match and is saved on this Mac.

## 4. Bench Test (mark honestly)

Open **Bench Test**. For each item, play the hardware and mark Pass / Fail / Unsure. Export JSON when done.

Suggested order (FM1-first):

1. Circuit notes appear in the app (Live RX on ch 1–8).
2. Circuit **tracks 5 and 6** notes reach the FM1 (**ch5 and ch6**) — generic H-1 until you mark Pass. (**Bench h.**)
3. Optional: twist FM1 knobs — community docs claim CC 20–23; mark Unsure/Fail until proven (do not assume Open maps).
4. Tracks 7–8 stay on Circuit only.
5. Optional if MPC connected: tracks 1–4 → MPC **ch9–12**.
6. Optional if DIN thru: close the app, play Circuit → MPC/SP follow tempo but play no notes.
7. Section Bridge / Mute Learn only after the FM1 path sounds good (SP PC still **ch13**, MPC PC **ch15**).

**Do not** enable app clock unless you deliberately want a second clock path (or USB-only — see below).

### USB-only clock (no DIN thru)

Use this when you want Circuit clock through Dawlessdaw over USB. **Important limitation:** Akai’s own KB says the MPC **USB-B port does not support receiving MIDI Clock from a DAW** — they require a **5-pin MIDI → USB interface into the MPC DIN In**. So even when Dawlessdaw correctly forwards FA/F8 to the Mac→MPC USB out, **MPC One may stay silent**. Prefer **DIN thru** for MPC start/tempo. FM1 jam does not need app clock.

#### Circuit Rhythm (do this first)

There is **no separate USB vs DIN clock switch**. One Tx pad feeds **both** USB and MIDI Out.

1. Hold **Shift + Save** → **Setup View**.
2. **Pad 32 — MIDI Clock Tx**: must be **bright** (ON). Dim = no Start/Clock leave the box (USB or DIN).
3. **Pad 31 — MIDI Clock Rx**: prefer **dim (OFF)** while Circuit is leader so a USB echo cannot steal tempo (Rx OFF = internal clock; Tx still works).
4. Press **Play** to save/exit Setup, then press **Play** again so the project is actually running (Start + Clock only while playing).
5. Do **not** use the analogue **Sync** 3.5 mm jack for this path — that is not MIDI Clock.

#### Dawlessdaw + MPC (via the Scarlett — current setup)

The MPC now gets notes and clock from the Scarlett 2i4's MIDI Out (DIN), not from USB or the thru box. Follow [mpc-via-scarlett.md](./mpc-via-scarlett.md). The steps below are the older **MPC USB** attempt, kept for reference.

#### Dawlessdaw + MPC (USB attempt — older)

1. **Dawlessdaw → Settings → App clock forwarding** → **Circuit clock → MPC: ON** (with MPC Out = the MPC's own USB port). Confirm Patchbay lists route **Circuit clock → MPC**.
2. **MPC Preferences → MIDI / SYNC:**
   - **SYNC RECEIVE → RECEIVE**: **MIDI Clock**
   - **ABLETON START/STOP SYNC**: **OFF**; Ableton Link off
   - **SYNC SEND → SEND**: **Off** (MPC must not also master)
   - **INPUT PORTS → Remote** (USB / Mac): **GLOBAL ON** (CONTROL + TRACK stay ON)
   - **INPUT PORTS → MPC** (hardware DIN row): **GLOBAL OFF** while DIN is unused
   - **OUTPUT PORTS → MPC + Remote → SYNC**: both **OFF**
3. Live on, Circuit **Play** → watch Patchbay (below). SP may follow USB sync; **MPC often will not** (Akai USB-B clock limitation).
4. **Warn:** if the MPC also gets DIN clock from the thru box, turn **Circuit clock → MPC** **OFF** so you do not double-clock.

#### See F8 / FA in Patchbay / Bench (diagnose)

| Monitor | Meaning | Next step |
|---------|---------|-----------|
| **IN = 0** (receive-none) | App never saw Circuit clock | Live MIDI? Pad 32 bright? Circuit actually playing? Settings → Circuit **In** port correct? |
| **IN > 0, OUT = 0** | Received but not forwarded | The right **Circuit clock → MPC / SP / FM1** switch ON? Route `mystudio-clock-mpc` (or `-sp`, `-fm1`) enabled? That device's **Out** assigned? Re-apply My Studio routes. |
| **IN > 0, OUT > 0**, MPC silent | App did its job (Mac sent FA/F8) | **Akai USB-B typically ignores MIDI Clock** — use **DIN thru fallback** below. Bench → **Send test Start/Clock → MPC** should also raise OUT without starting MPC. |
| Patchbay counters | `F8` = Timing Clock, `FA` = Start, `FB` = Continue, `FC` = Stop | Bench **l.** Focus → Play; detections show `start [fa]` / sampled `clock [f8]`. |

Chrome Web MIDI honesty: F8/FA arrive on the **main thread** with jitter; fine for coarse start/stop checks, **not** sample-accurate master clock. Prefer DIN for groove.

#### DIN thru fallback (recommended for MPC)

1. Settings → **Circuit clock → MPC: OFF**, and MPC connection = **MIDI cable from thru box only**.
2. Cable: Circuit **MIDI Out** → thru → MPC **MIDI In** (and SP In if needed).
3. MPC **INPUT PORTS → MPC → GLOBAL ON**; **Remote GLOBAL** can stay ON for notes but Sync Receive still MIDI Clock.
4. Circuit Play → MPC should start/follow tempo on the DIN path.

## 5. After the bench

- Export the Bench JSON and keep it with your session notes.
- Only treat a feature as verified when its row is **Pass**.
- ZED stays audio-only — no MIDI checklist for it.
