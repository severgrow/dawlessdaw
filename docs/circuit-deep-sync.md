# Circuit Deep Sync — research + safe POC

**Branch:** `cursor/circuit-deep-sync-research-22ab` · **Ask before merge.**  
**Honesty:** No bidirectional live pattern sync is claimed. Stock USB MIDI does **not** expose unsaved internal sequencer RAM.

## How to open the bench

1. Run the web app (`npm run dev` in the repo).
2. Open the **Test** tab.
3. At the top: **Circuit Deep Sync** → **Enable Circuit Deep Sync** (confirm dialog) → **Open panel**.

Isolated Web MIDI session (`sysex: true`). Production routing / sequencer / FLIP are untouched.

## Verdict (Phase 1)

Circuit Remix’s pattern display/export reads **saved session files** (`Sessions/NN_Name.ncs`), either from the microSD (File System Access) or over USB via Novation’s **Components-style file protocol** (`F0 00 20 29 01 63 03 CMD…`). That is **saved project storage**, not a live pattern dump. Opening a USB file session **stops playback and locks the panel**. Unsaved edits are explicitly excluded. Official Programmer’s Reference Guide v5 documents **zero** SysEx pattern dumps — only notes, CC/NRPN, Program Change, clock/transport.

---

## Capability matrix

| Capability | Tier | Lane | Notes |
|------------|------|------|-------|
| Performance Note/CC/Clock/PGM | documented-unverified | stock MIDI | PRG v5; Bench a–d |
| Universal Identity Request | proven | stock MIDI | MIDI 1.0; Remix `Device.identify` |
| Saved `.ncs` pattern layout (8×8×32 + 12 lanes) | proven | saved project | Remix `patParse` / `Patterns.*` |
| USB file-protocol **read** of Sessions | proven | stock file protocol | Remix `Device.read`; **stops transport** |
| Live / unsaved pattern RAM dump | **unsupported** | stock MIDI | Not in PRG; Remix snapshot omits unsaved |
| Scene MIDI | unsupported | stock MIDI | Not in PRG |
| Custom FW marker query | proven | custom-firmware | Remix `fwQuery`; null on stock |
| Live step/pattern notify (custom FW) | theoretical | custom-firmware | Design-only — do not flash |
| Firmware update / storage writes | unsupported | — | Forbidden in this bench |

Tiers: **proven** · **documented-unverified** · **theoretical** · **unsupported**

---

## File / function references

### Circuit Remix (`Ghillermo/CIRCUIT-REMIX`)

| What | Where |
|------|--------|
| Session / pattern sizes | `tools/rm_app.html` — `SESS_SIZE`, `PAT0`, `PAT`, comment at ~L208 |
| Session open / validate | `openSession` (~L496) |
| Pattern parse / build / MIDI export | `patParse`, `patBuild`, `patMidi`, `Patterns` (~L557–649) |
| USB Device file protocol | `Device` class (~L927+): `identify`, `fwQuery`, `open`/`close`, `read`/`write` |
| Connect warning (stop + lock) | `connectDevice` (~L1864) |
| Snapshot excludes unsaved | `snapAct` copy (~L1905) |

### Rhythm Plus (`mefisme/rhythm-plus`)

Custom firmware **on top of** official 2.0.1 (build 5706). Patching via Remix submodule `builds/` + `modules/`. Emulator tests under `tests/`. **No** stock live pattern-dump protocol added for host sync. Install risk/recovery documented in README (Components / Sample Rec+Samples+Note boot).

### CIRCUIT-HACKS-RC

Tracks (not Rhythm) modded FW + `tools/sd_app.html` storage tooling. Same family of reverse-engineered storage/USB ideas; not a Rhythm live-sequencer API.

### Official Novation

- [PRG v5](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_programmer_s_reference_guide_v5_2.pdf) — notes, CC/NRPN, PGM ch16, clock; **no SysEx**.
- [User Guide MIDI appendix](https://userguides.novationmusic.com/hc/en-gb/articles/25494352755730-Circuit-Rhythm-appendix)
- [FW 2.0 addendum](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/circuit_rhythm_2.0_firmware_update_addendum_v1_english_en.pdf) — scenes/mutes; not pattern SysEx.

### Dawlessdaw

| What | Where |
|------|--------|
| Official CC/PGM map | `packages/devices/src/circuit-rhythm/midi-map.ts` |
| Production never SysEx | `packages/midi/src/web-midi-transport.ts` (`sysex: false`); `packages/routing/src/engine.ts` drops sysex |
| Deep Sync package | `packages/devices/src/circuit-deep-sync/*` |
| Isolated bench UI | `apps/web/src/circuit-deep-sync/*` on **Test** tab |

---

## Pattern-data access explanation

```
                    ┌─────────────────────────┐
  Live playing ───► │ Performance MIDI (TX)   │  notes/CC/clock/PGM
                    │ PRG-documented          │  ≠ pattern grid dump
                    └─────────────────────────┘

  Unsaved edits ──► (internal RAM)            ✗ not exposed on stock MIDI

  Save project ───► Sessions/NN_*.ncs          ✓ Remix/SD or file-protocol read
                    8 tracks × 8 patterns
                    32 steps × 8 B + 12 lanes
```

**Do not** treat Remix’s pattern viewer as live sync.

---

## Phase 3 — Hardware test matrix (A–I)

Run with **Test → Circuit Deep Sync** enabled + raw monitor. Mark each row after hardware.

| ID | Action | Expected events | Protocol responses | Readable pattern? | Stop needed? | Save needed? | Match HW? | Real HW executed? |
|----|--------|-----------------|--------------------|-------------------|--------------|--------------|-----------|-------------------|
| A | Stopped, saved project, Identity | Identity reply | Identity | n/a | no | n/a | _user_ | _user_ |
| B | Playing, Note Tx ON | Note On/Off ch1–8 | none (perf) | no (perf only) | no | no | _user_ | _user_ |
| C | Playing, change velocity / micro-step on pad | May change note vel / timing of perf notes | none | no live grid | no | no | _user_ | _user_ |
| D | Unsaved step edit, then Identity / passive listen | Perf MIDI only if playing | Identity | **no** unsaved dump | no | — | _user_ | _user_ |
| E | Unsaved edit, then file-protocol session read | Session open status | file read `.ncs` | **saved** only | **yes** | to capture edits | _user_ | _user_ |
| F | Track mute while playing | Note Tx gap on muted ch (Bench b) | none | no | no | no | _user_ | _user_ |
| G | Pattern change (same project) | Often **no** dedicated msg; perf notes change | none | no | no | no | _user_ | _user_ |
| H | Scene change | No dedicated Scene MIDI in PRG (Bench c) | capture any | no | no | no | _user_ | _user_ |
| I | Project change | PGM ch16 (Bench d) | PGM | no grid | no | no | _user_ | _user_ |

Distinguish **performance notes** (monitor class `performance`) vs **stored sequence** (only after `.ncs` parse / device file read).

---

## Phase 4 — Firmware feasibility (design only — do not implement or flash)

### Patching infra

- Remix / Rhythm Plus: Python patch builds over stock **2.0.1 / 5706**, emulator tests, Web uploader in `rm_app.html` / Rhythm Plus app.
- Recovery: Novation Components, or Sample Rec + Samples + Note while powering on, then official `.syx`.

### Smallest read-only FW features (proposal)

1. **Capability query** — extend Remix-style `0x7D 43 54` marker with a versioned “deep-sync vN” bitfield (read-only).
2. **Snapshot request** — host asks for current **playing** pattern slot(s); device replies with step/lane blob from RAM (opt-in, rate-limited).
3. **Track/pattern/step notifications** — small SysEx or CC-ish events on pattern change / step hit (debounce; disable under heavy clock load).

### Constraints

| Area | Risk |
|------|------|
| Memory | Pattern blobs are large (0xA28 × 64); prefer single-pattern snapshots |
| USB / timing | File protocol already saturates USB; live notify must not stall audio DSP |
| Compat | Keep stock MIDI behaviour; capability bit = opt-in |
| Recovery | Always leave Components recovery path intact |

### Versioned Dawlessdaw host protocol (sketch)

```
DawlessDeepSync/1
  C → D: capability query
  D → C: caps bitmask + fw marker
  C → D: snapshot(track, pattern|playing)
  D → C: snapshot payload (steps + lane summary)
  D → C: notify(pattern_change | step)   # optional
```

**Not implemented in this PR.**

---

## Risk / recovery

| Op | Risk | Mitigation |
|----|------|------------|
| Identity / FW marker / monitor | Low | Safe read-only |
| Local `.ncs` parse | None to device | Offline file |
| File-session open/read | Stops transport; Remix warns RAM rules if mis-sequenced | Confirm dialog; close session after read; never write/delete |
| Firmware flash | High | **Not offered** |
| Custom FW install | Brick / data loss | Out of scope; Components recovery only if user chooses later |

---

## What you must verify on hardware

1. Identity reply identifies Circuit Rhythm on your FW (expect 2.0.1).
2. Passive monitor shows performance notes while playing — not a grid dump.
3. Local `.ncs` from a Components/SD backup parses and shows the expected hits.
4. Optional: device file read after confirm — playback stops; returned data matches **saved** project, not unsaved edits.
5. Fill matrix A–I in the exported JSON notes / your own checklist.

Export: **Export JSON report** on the Deep Sync panel.
