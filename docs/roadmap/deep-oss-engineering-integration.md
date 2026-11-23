# SPLOT — Deep open-source engineering integration

**Status:** Pass 1–2 complete (research). Pass 3+ not started.  
**Audited tip:** `main` @ `3a05561` (2026-11-23). Brand: **Splot MIDI Brain**.  
**Source brief:** Patryk 2026-11-23. Complements [master roadmap](./SPLOT-SOFTWARE-FIRST-HARDWARE-READY.md) and [MMT-8 lessons](../mmt8-lessons.md).  
**Rules:** No GPL/AGPL/MMT-8 firmware into product without approval. Prefer REUSE → ADAPT → REIMPLEMENT → REFERENCE → IGNORE. One cohesive Splot engine — not 11 architectures.

## Absolute rules

Protect current work. No destructive git. No HW manufacture. No clock-default changes. No app rewrite. No A2 implementation in this PR (routing stress is next worker).

## Decision vocabulary

| Class | Meaning |
| --- | --- |
| **REUSE** | Permissive licence; may vend/adapt source with credit after explicit approve |
| **ADAPT** | Use ideas / protocols; rewrite in Splot style (or thin adapter) |
| **REIMPLEMENT** | Study behaviour; write original Splot code |
| **REFERENCE** | Read for patterns only; never ship their code |
| **IGNORE** | Out of scope or wrong problem |

**Reuse kinds in Pass 2:** *code* = actual source/files under permissive licence; *concept* = architecture/behaviour ideas only (GPL/AGPL/unclear stay here).

---

## Pass 1 — Gap table (existing Splot vs 11 repos)

Splot today (tip): Web MIDI + Mock transport; `MidiRoutingEngine` (multi-dest, feedback window, clock authority, active-note cleanup); device profiles; sequencer + Circuit Mirror/Intelligence; Timing Lab; Super Macros; Performance Memory; Session Recorder + FLIP; IndexedDB storage; Vitest (incl. behavioural MIDI). Gaps called out relative to that — not a wishlist to import whole products.

| # | Project | Licence (verified tip) | Tip SHA (short) | Class | What they have that Splot lacks / differs | Splot already covers | Decision notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Zynthian](https://github.com/zynthian/zynthian-ui) (`zynthian-ui`) | GPLv3 | `1723a5abe08c` (vangelis) | **REIMPLEMENT** / **REFERENCE** | Engine chains, mixer strip model, JACK autoconnect, snapshot/state machine, headless service mindset | Routing presets, sessions, device adapters (optional) | Do **not** copy Python/UI. Reimplement chain/state *concepts* inside StudioRuntime later (Phase C/E). |
| 2 | [norns](https://github.com/monome/norns) | GPLv3 | `227aa0442181` | **REIMPLEMENT** / **REFERENCE** | Hard split control vs audio threads; BufDiskWorker-style async disk I/O; mixing/sampling host | Event bus partition for clock; FLIP/Session on main thread | Concept only: keep MIDI path off React; defer real audio-thread worker until native. |
| 3 | [Bespoke](https://github.com/BespokeSynth/BespokeSynth) | GPLv3 | `4c9b4b1361d6` | **REIMPLEMENT** / **REFERENCE** | Safe audio graph switch; ControlRecorder; macro cables | Soft takeover + Super Macros (partial); no modular audio graph | Learn safe-switch / recorder edge cases; reimplement tests in Vitest — no C++ import. |
| 4 | [MIXTEE](https://github.com/openaudiotools/mixtee) | MIT FW + CERN-OHL-P HW + CC BY docs | `14d4040034ce` | **REFERENCE** | Compact 16×8 mixer topology, MIDI CC bank map, enclosure constraints | ZED is audio-only (no MIDI mixer control); FLIP stereo lane | Pre-proto — **no mixer firmware in tree yet**. Docs-only for STUDIO horizon. Do not start PCB. |
| 5 | [zicBox](https://github.com/apiel/zicBox) | GPLv3 | `e6642123476e` | **REIMPLEMENT** / **REFERENCE** | Portable DSP/UI on small boards; sample-clock caveats | Browser sequencer (not sample-accurate) | Reference for LITE clock honesty; no GPL DSP. |
| 6 | **Cross** → [Nota](https://github.com/nota-daw/nota) | AGPLv3 (JUCE dual-licence path) | `d8b0be32ded9` (develop) | **REFERENCE** | C ABI backend, `FakeAsioDriver` / swappable audio backend, immutable graph snapshots, scenes | `HardwareTransport` + Mock; NativeBridge stub; no audio graph ABI | Brief name “Cross” = cross-platform Nota (AGPL + fake backend + graph). **Concept-only** fake-backend pattern for headless tests — never vend AGPL. |
| 7 | [Tracktion Engine](https://github.com/Tracktion/tracktion_engine) | GPL3 **or** commercial + JUCE | `be4a6a0c94cc` (develop) | **REFERENCE** | Active-note / transport / MIDI↔audio sync edge cases at DAW scale | `activeNotes` + `allNotesOff` on route change/stop | Study edge cases → Vitest fixtures. No engine adoption without commercial licence decision. |
| 8 | [mod-host](https://github.com/mod-audio/mod-host) | GPLv3 | `12335c265374` | **REFERENCE** | Headless command socket for LV2 graph | UI-independent commands still incomplete (Phase C6) | Command *shape* inspiration only — **no LV2 host for vanity**. |
| 9 | [hexatrack](https://github.com/audiodestrukt/hexatrack) | **MIT** | `722828ccb171` | **REUSE** (panelspec) / **REFERENCE** (seq-core) | `crates/panelspec`: YAML behaviour specs + JSON-lines stdin/stdout adapter; allocation-free seq-core | Vitest + MockMidiTransport behavioural tests | Only permissive **code** reuse candidate among the 11. Prefer strengthen Vitest first; optional panelspec adapter later. |
| 10 | [ESPidi](https://github.com/EugeneCarlo/ESPidi) | GPLv3 | `7bb0888ed780` | **REFERENCE** | ESP32-C3 MIDI brain patterns | Software-first; NativeBridge stub | Future **LITE** research only — not now. |
| 11 | [MMT-8 sim](https://github.com/audiodestrukt/mmt8) | **No clear licence** + proprietary FW | `f4021d7e1480` | **REFERENCE ONLY** | Behavioural recording, interrupt/timing separation, parts/mute | Strengthened Vitest note/transport fixtures (#51); Performance Memory partial | **Never** copy firmware, decompiled code, emulator, or fixtures. Ideas only — see [mmt8-lessons.md](../mmt8-lessons.md). |

### Splot improvement order (unchanged)

A MIDI reliability · B Unified Instrument · C Audio backend contract · D Performance Memory · E Shared timing · F Mixer/FLIP model · G Hardware-control commands.

---

## Pass 2 — Reuse register (top 5)

| Rank | Opportunity | Licence | Path / tip | Reuse kind | Integration cost | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **hexatrack panelspec** as optional Vitest-adjacent behavioural runner | MIT | `audiodestrukt/hexatrack` @ `722828ccb171` — `crates/panelspec`, JSON-lines adapter docs | **Concept** (locked) | Zero vend — Vitest harness already covers A2/A3/A5 + StudioCommands | **CLOSED (step 12):** extend Vitest; do **not** adopt panelspec runner. See [panelspec-eval.md](./panelspec-eval.md). seq-core stays REFERENCE. |
| 2 | **Zynthian chain / state / autoconnect concepts** | GPLv3 | `zynthian/zynthian-ui` @ `1723a5abe08c` | **Concept** | Medium: design StudioEngine chain + snapshot model (Phase C/E) without importing Python | **REIMPLEMENT** — no code copy. **Step 13:** additive `Instrument` / `InstrumentChain` schema in `@dawlessdaw/devices` (see [instrument-schema.md](./instrument-schema.md)); runtime compile-to-routes later. |
| 3 | **norns control vs audio + disk-worker ideas** | GPLv3 | `monome/norns` @ `227aa0442181` | **Concept** | Medium–high: needs native/audio thread; browser can only approximate | **REIMPLEMENT** boundaries when NativeBridge/audio contract starts; **REFERENCE** until then |
| 4 | **Tracktion active-note / transport edge cases** | GPL/commercial | `Tracktion/tracktion_engine` @ `be4a6a0c94cc` | **Concept** | Low: turn documented edge cases into Vitest (hanging notes, Start/Continue/Stop, clock loss) — extends #51 | **REIMPLEMENT** tests/behaviour — **no** engine link |
| 5 | **Cross/Nota fake-backend + graph snapshot pattern** | AGPLv3 | `nota-daw/nota` @ `d8b0be32ded9` — AudioBackend / FakeAsioDriver | **Concept** | Medium: expand Mock + future audio backend contract; immutable route/graph snapshot for tests | **REIMPLEMENT** — **step 14:** `@dawlessdaw/audio` (`AudioBackend`, `FakeAudioBackend`, `WorkletAudioBackend` + snapshot). **Never** copy AGPL sources. |

### Explicit non-reuse

| Item | Why |
| --- | --- |
| Any GPL/AGPL source into `packages/` or `apps/` | Product licence risk — needs Patryk approval first (none given) |
| MMT-8 firmware / decompile / emulator / fixtures | Unclear licence + proprietary FW |
| MIXTEE hardware / missing firmware | Pre-proto; HW manufacture deferred |
| mod-host as LV2 host dependency | Wrong product; vanity host cost |
| ESPidi now | LITE-only; software queue first |
| hexatrack seq-core as Splot sequencer | Different product surface; REFERENCE only |

---

## Do now / after / before native / before hardware / research only

| Bucket | Actions |
| --- | --- |
| **Do now** | Keep this living doc accurate; next software worker = **A2** routing panic / hanging notes / disconnect stress on tip (no OSS copy). Continue honest bench labels. |
| **After** (software quiet + A2) | Pass 3 low-risk reliability tests/fixes; optional panelspec-vs-Vitest spike (docs/PR, no GPL). Strengthen Universal Instrument / first-run (B). |
| **Before native** | Freeze `HardwareTransport` + command contracts; headless StudioEngine extraction (C1–C7); Mock/fake audio backend *concept* implemented in-tree; NativeBridge remains stub until contracts stable. |
| **Before hardware (LITE/STUDIO)** | No PCB/ESP32/manufacture. ESPidi + MIXTEE docs stay REFERENCE. Prove software sessions reliable on Patryk’s rig (A1). |
| **Research only** | MMT-8, Zynthian/norns/Bespoke/zicBox/mod-host internals, Tracktion without commercial licence, Nota AGPL tree. |

### Pass checkpoint plan (unchanged)

1 Research gap table ✅ · 2 Reuse register + top 5 ✅ · 3 Low-risk reliability tests/fixes · 4 One portable seam · 5 Memory foundation · 6 Future audio architecture. **Stop after each reviewable checkpoint.**

---

## Licence-risk note

**Do not** bring GPL, AGPL, or MMT-8 firmware (or decompiled/emulator artefacts) into the Splot product tree without written Patryk approval.

- Permissive (MIT / CERN-OHL-P docs / CC BY) may be reused with credit after a focused PR — today that is essentially **hexatrack panelspec** (and MIXTEE *docs* as reference, not firmware).
- GPL/AGPL projects in this list are **REFERENCE / REIMPLEMENT** only.
- Tracktion dual-licence ≠ free product use; treating as REFERENCE until a commercial decision exists.
- Prefer original Splot implementations of learned behaviour over vendoring foreign engines.

---

## Out of scope for this PR

No GPL/AGPL code copy · no MMT-8 import · no app rewrite · no clock-default changes · no A2 implementation · no Pass 3+ code.
