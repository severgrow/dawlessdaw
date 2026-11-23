# Five intelligent hardware features — overview

Brand: **Splot MIDI Brain**. Circuit makes the musical decisions; Splot understands the performance and adds what the hardware cannot. All five milestones are **experimental** until Patryk confirms on hardware. Stacked PRs — batch merge later.

## How they fit together

```
Circuit MIDI in
    │
    ├─► Circuit Intelligence (M1) — last-touched, activity, musical position
    │         │
    │         ├─► Timing Lab (M2) — Clock Health + Latency Lab (no auto delay)
    │         │
    │         ├─► Super Macros (M3) — opt-in fan-out + soft takeover + A/B morph
    │         │
    │         └─► Performance Memory (M4) — timeline + markers while recording
    │
    └─► MIDI-guided FLIP (M5) — note-ons with audio capture → slice suggestions
              │
              └─ uses Timing Lab / FLIP offset for latency labels
                 exports to Samples / SP WAV download (no serial write)
```

| # | Feature | Role | Outbound MIDI? |
|---|---------|------|----------------|
| 1 | Circuit Intelligence | Passive analysis on Circuit-in | Never |
| 2 | Timing Lab | Clock quality + user latency measure | Lab pings only when you run it |
| 3 | Cross-device macros | Opt-in CC fan-out + morph | Only when Super Macro enabled |
| 4 | Performance Memory | Session timeline + markers | Event-actions off by default |
| 5 | MIDI-guided FLIP | Slice suggestions from MIDI + audio | Never from guidance; exports are files |

Shared foundation: `@dawlessdaw/sequencer` musical events / position. Analysis stays off the critical routing path. Prefer docs-backed / verified CC targets. Never flash firmware, never SysEx to instruments, never write device storage except new WAV in SP SD `IMPORT/` via the existing grant flow.

## Docs

- [circuit-intelligence.md](./circuit-intelligence.md)
- [timing-lab.md](./timing-lab.md)
- [cross-device-macros.md](./cross-device-macros.md)
- [performance-memory.md](./performance-memory.md)
- [midi-guided-flip.md](./midi-guided-flip.md)
- [flip.md](./flip.md) (base FLIP lane)
