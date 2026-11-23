# Locked decisions (22 Nov 2026 + Phase 0)

Owner confirmed **"yeah all go"** on the handover confirmation questions. Phase 0 brand/preset locks added 23 Nov. These are locked until the owner changes them.

| # | Decision |
|---|---|
| 1 | Merge order: **PR #13** then **PR #14** onto `main` (retarget #14 to `main` after #13). Done: #13 → `69b6354`, #14 → `094a00b`. |
| 2 | Palette (Phase 1): **mint shades** are the primary colour language; **burgundy only for accents** (SP device, danger, fail). Near-black backgrounds + bone typography. |
| 3 | My Studio: Skiff T1–4 on MIDI channels **1–4** (Skiff default). Hardware MENU › MIDI › T1–T4 CHANNEL must match, or use Advanced → Skiff track channels. |
| 4 | Advanced toggle = real MIDI channel + CC numbers + Custom CC + Skiff channel table. |
| 5 | Device colours: SP = burgundy accent, FM1 = mint, MPC = bone/off-white (`--bone` `#e8e1d2`). |
| 6 | Scenes stay gone; Sessions are enough for presets. |
| 7 | Rig grid stays **read-only**; routing edits live on the Controller tab. |
| 8 | Ask before merging any PR. Serialize Splot phases unless the owner says otherwise. |
| 9 | SP effect CTRL (bench h6) and Scarlett MPC Step 3 proceed as listed in HANDOVER — do **not** claim hardware Pass without owner confirmation. |
| 10 | Product brand **Splot MIDI Brain** (header `splot / midi brain`). Do not rename packages, folders, or localStorage keys yet. |
| 11 | Default Controller preset **Ploe Live v1** (T1–4 MPC, T5–6 Skiff 1–2, T7–8 SP A–B). Keep older My Studio presets. |
| 12 | Circuit Intelligence is **passive** (Circuit-in only). Activity labels never auto-mute hardware. Auto-focus from macros is optional (default on). |
| 13 | Timing Lab: Clock Health is passive; Latency Lab is user-triggered only. Splot does not become clock master and does not auto-apply delay correction. |
| 14 | Cross-device Super Macros are **opt-in**; A/B scenes are Splot-owned (not Circuit Scenes); only docs-backed/verified CC presets in the default catalog; Controller MIDI Learn stays single-destination. |
| 15 | Performance Memory is analysis-only while recording; Section Bridge **event-actions** stay **off by default**; inferred events never auto-fill SP/MPC; original take audio/MIDI observations are kept. |

See also [HANDOVER.md](./HANDOVER.md) and [circuit-controller.md](./circuit-controller.md).
