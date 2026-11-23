# Patryk’s rig — deeper integration research (software-first)

**Date:** 2026-11-23 (revised)  
**Baseline:** `main` @ `a7945ad` (post #76 fidelity · includes #73–#75 audio/instrument/mixer)  
**Status:** docs-only · **experimental** until owner Bench Pass  
**Verified against:** `packages/devices` profiles + studio-layout, `limitations.md`, `mpc-via-scarlett.md`, `circuit-tempo-follow.md`, `sp404-phase-3.md`, `audio-fidelity-hardware-protocol.md`, `@dawlessdaw/audio`

**Constraints (prefs):** no SysEx / firmware flash · no app clock forward **by default** · no MacBook / iPhone / Continuity mics · SP disk write = new WAV under `IMPORT/` only · soft mint UI · never claim hardware Pass without Patryk

Prefer ideas that Vitest / `MockMidiTransport` / `FakeAudioBackend` can prove **before** Bench.

---

## Rig (locked)

| Device | Role | Path |
|--------|------|------|
| Novation Circuit Rhythm (stock **2.x**) | Arranger / macros / Project PC | USB → Mac; MIDI Out → thru box |
| Akai MPC One gen1 (MPC 3) | Sampler / tracks 1–4 | **DIN In ← Scarlett 2i4 MIDI Out** (not USB-B clock) |
| Roland SP-404MKII (stock **5.52**) | FX / banks | USB → Mac + DIN clock from thru |
| Allen & Heath ZED-10FX | Mix / USB audio | USB stereo (“USB Audio CODEC”) — **no MIDI** |
| Focusrite Scarlett 2i4 | MIDI DIN out + optional audio | Mac ↔ MPC DIN; also capture candidate |

```
Circuit ──USB──▶ Mac (Splot) ──USB──▶ Scarlett 2i4 ──DIN Out──▶ MPC MIDI In
   │
   └──MIDI Out──▶ thru box ──▶ SP-404MKII MIDI In (clock)
ZED / Scarlett USB audio ──▶ Sessions / FLIP (never Continuity mic)
```

---

## Per device — what Splot has · deeper · Bench · risk

Honesty labels from `DEVICE_PROFILES` / `limitations.md`: **verified** | **untested** | **experimental** | **unavailable**.

### 1. Novation Circuit Rhythm (stock 2.x)

| Area | On tip today | Deeper (software-first) | Bench | Risk |
|------|--------------|-------------------------|-------|------|
| **Profile** | `circuit-rhythm` — ch 1–8 tracks, Project PGM ch16, macros **CC21–28**, Mixer Level/Pan **CC29/30** (PRG v5). Scene MIDI = **unavailable** | Keep PRG-backed map only; never invent Scene sync | Confirm CC Tx ON; macros + Mixer TX | Low if docs-only |
| **Observe** | Circuit Mirror + Intelligence + Phase 2 = **passive observe** of T1–8 notes/clock/PGM (experimental). Live pattern dump over stock MIDI = **unsupported** | Project PGM → Studio Scene mapping table; mute stay inferred | Mirror grid matches pads | Medium if over-claiming mute |
| **Controller (active)** | Default preset **Ploe Live v1** (`controller.ts`) **actively remaps** Circuit T1–8 notes/macros out to MPC/SP/FM1 — this is **not** observe-only | Keep remap as the performance path; do not confuse with Mirror | 22 Nov narrative Pass: T1–4→MPC DIN, T7–8→SP USB (see bench-results) | Medium if copy says “observe-only tracks” |
| **Routing** | `buildMyStudioRoutes` — T1–4 → MPC ch9–12, T5–8 → FM1 (or Ploe T7–8→SP); `forwardClock: false` on note routes; clockToMpc/Sp **off by default** | Instrument-schema → route compile **behind flag**; chains never imply clock | Busy 4-track notes | Medium if compile breaks presets |
| **Macros / Learn** | Controller + Super Macros (CC21–28 fan-out); soft takeover off by default | Traffic/Hz polish; Learn destinations already exist | h2–h6 / Super Macro checklist | Medium (wrong dest CC) |
| **Tempo** | Tempo-follow **display** from F8 (`circuitTempo`) — not a master; does **not** enable clock forward | Keep display-only; ClockHealth/Timing Lab honesty | BPM ≈ Circuit; SP still via thru | Low |
| **Deep Sync** | `.ncs` / Components-style file only; stock MIDI dump **unsupported** | UI caution already; no USB file-protocol while playing | Optional SD `.ncs` open | High if USB protocol mid-play |
| **FLIP / Sessions** | Circuit audio unused; MIDI-guided FLIP experimental | Markers + Memory link only | Markers survive save | Low |

**Gap vs “tracks 1–8 observe-only”:** That constraint means **no pattern/state reconstruction** and Mirror stays passive — **not** that Controller stops remapping performance MIDI. Arranger observe-only exists in code but is **not** the default live path (Ploe / My Studio Controller is). Do not treat Mirror as “Circuit state sync.”

### 2. Akai MPC One gen1 (via Scarlett DIN)

| Area | On tip today | Deeper | Bench | Risk |
|------|--------------|--------|-------|------|
| **Profile** | `mpc-one` — MIDI I/O **untested**; MPC3 remote/SysEx **unavailable**; DIN notes/clock caps **untested** (g2/g3) | Honesty UI: USB-B clock is useless | g2 notes · g3 clock · i timing | Claiming USB clock works = high |
| **Routing** | MPC Out = Scarlett port (manual); “MPC follows Circuit Play” **opt-in** transport route; notes T1–4 → ch9–12; channel isolation docs | Setup **next-action** progressive DIN checklist (Pass A/B style) | Sequencer runs on Play; ch isolation (not All / not Auto) | Medium (double clock if SP forward on) |
| **Macros / Learn** | Learnable knobs preset; Learn glass | Keep Learn; no invented MPC remote | g4 Learn | Low–medium |
| **Tempo** | App forwards clock **only** when MPC-follow On | Never default-on | g3 Pass | High if default flipped |
| **FLIP / Sessions** | Indirect (audio via Scarlett/ZED) | — | — | — |

**Gap:** Mac often cannot use MPC USB MIDI usefully for clock — product path is Scarlett DIN. Port auto-assign of Scarlett → MPC is intentionally **not** automatic (Scarlett is also audio).

### 3. Roland SP-404MKII (stock 5.52)

| Area | On tip today | Deeper | Bench | Risk |
|------|--------------|--------|-------|------|
| **Profile** | `sp404mkii-stock` — notes/CC **untested**; pad remote **unavailable**. DOOM = flag only | Stay stock; skip DOOM until stock solid | Mode A notes/PC | High if pad-push claimed |
| **Routing / clock** | USB notes/CCs; **DIN clock via thru** — leave → SP tempo **OFF** by default | Copy in Setup if user enables SP forward | Thru clock only; no double clock | Medium |
| **Macros** | Effect CTRL CCs 16–19 / 80–83; effect-by-ear naming | SP EFX panel polish | h6 | Medium |
| **Sections** | Mode A bank PC (experimental); legacy ch13 | Honesty: bank PC ≠ pad push | Pattern change on Project | Medium |
| **Sessions / disk** | WAV → SD `IMPORT/` only; SHIFT+Import on device | Path/filename tests; never overwrite pads over USB | One new sample in IMPORT/ | Medium (wrong path) |
| **USB Serial** | Read-only browse; **5.51** known; **5.52 needs explicit OK** | Gate stays; no write/erase | Optional browse | High on 5.52 without OK |

### 4. Allen & Heath ZED-10FX

| Area | On tip today | Deeper | Bench | Risk |
|------|--------------|--------|-------|------|
| **Profile** | `zed-10fx` — `hasMidi: false`; USB audio **untested**; MIDI control **unavailable** | Never fake MIDI strips | — | Inventing ZED MIDI = forbidden |
| **Audio** | Preferred capture input (`isPreferredInterface` / “USB Audio CODEC” via usb audio hint); Sessions/FLIP; AudioBackend + mixer **data model** (#75) | MixerGraph UI = logical only; ZED stays one stereo capture bus | audio-fidelity P8 | Medium if MIXTEE-like claims |
| **FLIP / Sessions** | Capture path shipped (#76 fidelity) | Quiet `framesDropped` readout after buffering lands | P8 Pass | Low |

### 5. Focusrite Scarlett 2i4

| Area | On tip today | Deeper | Bench | Risk |
|------|--------------|--------|-------|------|
| **Profile** | **No** `DEVICE_PROFILES` entry — treated as WebMIDI/audio interface name (“Scarlett 2i4 USB”) | Optional generic “USB MIDI interface” role for DIN-out hosts; do **not** auto-bind as MPC Out | Audio MIDI Setup name stable | Auto-bind = medium (steals audio I/O assumption) |
| **MIDI** | MPC Out target; transport + notes share one DIN stream | Setup checklist + test Start/Clock/Stop burst | g2/g3/i | Low in software |
| **Audio** | Preferred capture alongside ZED; built-ins filtered | Same P8 protocol | P8 | Low |

---

## Ranked opportunities (impact × risk)

Impact 1–5 (musical payoff on this rig). Risk 1–5 (wrong MIDI, data loss, unverifiable claim, licence). **Score = Impact − Risk**.

| Rank | Idea | Impact | Risk | Score | Notes |
|------|------|--------|------|-------|-------|
| 1 | **MPC DIN honesty + Setup next-action** — USB-B useless; Scarlett Out → MPC In; Receive Clock; ch 9–12; monitoring In | 5 | 1 | **+4** | Docs exist; software = clearer progressive step. Bench g3. |
| 2 | **Circuit→MPC note reliability** — extend A2 with busy 4-track Vitest; optional Timing Lab vs ear | 5 | 1 | **+4** | Pure software + ear. |
| 3 | **ZED/Scarlett Sessions Bench (P8)** — mark verified only after Pass | 5 | 1 | **+4** | Path shipped; needs hardware. Never Continuity mic. |
| 4 | **FLIP single-gain + monitor OFF** — #76 fixed; Bench ear check | 4 | 1 | **+3** | Gain once, not 4×. |
| 5 | **Circuit Mixer CC29/30 → dest CC7/CC10** — confirm My Studio remap | 4 | 2 | **+2** | Not macros 21–28. Bench Mixer ▼. |
| 6 | **SP Mode A bank PC + pad map honesty** | 4 | 2 | **+2** | Never claim pad push over USB. Stock 5.52. |
| 7 | **Sessions → SP `IMPORT/` only** | 4 | 2 | **+2** | Allowed write; on-device Import stays manual. |
| 8 | **Project PGM → Studio Scene map** (observe ch16) | 4 | 2 | **+2** | Docs-backed; ≠ Scene MIDI. |
| 9 | **Circuit Deep Sync = file only** | 3 | 1 | **+2** | Aligns with limitations. |
| 10 | **Tempo-follow display honesty** | 3 | 1 | **+2** | Shipped; Bench UI ≈ BPM without default clock forward. |
| 11 | **Performance Memory + FLIP markers** | 3 | 1 | **+2** | Observation-only. |
| 12 | **Capture buffer drop stats** (post buffering) | 3 | 1 | **+2** | Quiet Sessions readout. |
| 13 | **SP EFX CTRL panel polish** | 3 | 2 | **+1** | Chart CCs only. |
| 14 | **Instrument schema → live routes (flag)** | 4 | 3 | **+1** | Never emit `forwardClock: true`. |
| 15 | **MixerGraph UI (logical strips)** | 3 | 2 | **+1** | Data model #75; no ZED MIDI / no MIXTEE claim. |
| 16 | **SP Web Serial 5.52 OK gate** | 3 | 3 | **0** | Read-only; impact limited vs Mode A. |
| 17 | **Native MIDI/audio bridge** | 5 | 4 | **+1** | After contracts freeze. |
| 18 | **DOOM OS SP** | 2 | 4 | **−2** | Skip. |
| 19 | **SysEx / FW / pad push USB** | 1 | 5 | **−4** | Forbidden. |
| 20 | **Clock-default on / Continuity mic** | 1 | 5 | **−4** | Forbidden. |

---

## Top 10 next **software** moves

Ordered for implementation **without waiting for Bench**. Each should stay Vitest-green and leave clock-default / mic policy untouched.

1. **Setup next-action: “MPC via Scarlett DIN”** — one progressive checklist (ports → connection mode → ch 9–12 / In monitoring → opt-in MPC follows Play). Soft mint, low copy.
2. **Vitest: busy 4-track Circuit→MPC hanging notes** — extend A2; panic / route-change under dense note+clock fixture.
3. **Project PGM (ch16) → Studio Scene mapping** — table + observe-only apply; never invent Scene MIDI; never forward PGM onto MPC note channels.
4. **Sessions quiet buffer honesty** — surface drop/recovery stats when capture buffering lands; no redesign.
5. **SP Mode A / IMPORT path copy + tests** — bank PC honesty; `IMPORT/` remains sole write; 5.52 Serial stays gated.
6. **Mixer Level/Pan remap regression tests** — CC29/30 → CC7/10 on My Studio destinations (distinct from macro 21–28).
7. **Instrument → route compile behind flag** — dual-write later; `chainImpliesClockForward === false` forever in this path.
8. **MixerGraph UI (logical)** — strips/mute/solo/buses from `#75` model; ZED = stereo capture bus only; no fake multichannel product.
9. **SP effect CTRL panel polish** — ear-name + Roland chart CCs; no effect on/off invention until Bench.
10. **Connect wizard Scarlett→MPC path** — first-run detects Scarlett MIDI port; never auto-selects Continuity mic for audio step.

**Defer (not top 10):** native bridge, DOOM, USB Serial write, any default clock-forward flip, ZED-as-MIDI.

---

## Software-first backlog (checklist)

- [ ] Keep A2/A3/A5 green; add busy 4-track case if missing  
- [ ] MPC DIN next-action step  
- [ ] PGM→Scene map (observe)  
- [ ] Buffer/drop readout after buffering merges  
- [ ] Instrument→route flag; never `forwardClock: true`  
- [ ] SP `IMPORT/` + Mode A tests stay sole write path  

## Bench when home (ordered)

1. MPC DIN clock follow (**g3**) — Pass / Fail honest  
2. ZED or Scarlett capture (**P8**) — Pass / Fail  
3. Circuit Mixer Level → dest volume (CC29→CC7)  
4. FLIP gain once + monitor OFF default  
5. SP IMPORT one WAV + Mode A pad/PC smoke  
6. Optional: Super Macros + SP EFX; Timing Lab **i**  

## Non-goals

- PCB / MIXTEE manufacture · LV2 / full DAW timeline · GPL/AGPL into `packages/`  
- Claiming hardware Pass without Patryk · Engine rewrite for this research  

## Related

| Doc | Use |
|-----|-----|
| `docs/limitations.md` | Honesty matrix |
| `docs/mpc-via-scarlett.md` | DIN path |
| `docs/circuit-tempo-follow.md` | Display-only tempo |
| `docs/sp404-phase-3.md` | Stock SP |
| `docs/audio-fidelity-hardware-protocol.md` | P8 |
| `docs/cross-device-macros.md` | Super Macros |
| `docs/roadmap/audio-backend.md` / `mixer-data-model.md` / `instrument-schema.md` | Seams already on tip |
| `docs/hardware-integration/top-15-capabilities.md` | Older capability rank (still useful) |
| `packages/devices/src/bench.ts` | g2/g3/h*/m rows |
| `packages/devices/src/profiles.ts` | Capability statuses |
| `docs/bench-results/2026-11-22-first-full-rig.md` | Owner narrative Pass (not formal JSON) |

**PRs on tip context:** #73 schema · #74 AudioBackend · #75 mixer model · #76 fidelity · buffering PRs if open — do not merge from this research task.
