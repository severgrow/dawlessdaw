# Performance Memory (Milestone 4)

**Honesty:** **experimental** until Patryk confirms on hardware. Timeline capture is analysis-only — never sends MIDI by itself.

## What it does

| Piece | Behaviour |
|-------|-----------|
| **Event timeline** | While Sessions (or FLIP) record, Splot logs transport, bar, project changes, track activity, macros, morphs, FLIP, markers, and pattern hints |
| **Auto musical markers** | Significant events become waveform markers; rename / delete; **inferred** rows are dashed + labelled |
| **Session nav** | Jump playhead from marker/timeline; select trim range; **Send trim to FLIP** |
| **Section event-actions** | Opt-in on Sections — **off by default**; only confirmed project-change may replay Bridge; **never** auto-fills SP/MPC from inference |
| **Persistence** | Markers + `performanceEvents` stored with the take in IndexedDB (existing session recorder store). Original PCM unchanged |

## Where

Record → **Sessions**. Timeline panel under the take editor. Sections → **Performance Memory event-actions** toggle.

## Engine

`PerformanceMemoryEngine` in `@dawlessdaw/sequencer`. Host starts it with capture; Circuit Intelligence events are ingested off the routing path.

## Hardware checklist (Patryk)

1. Sessions → allow mic → Record while Circuit plays (clock + a Project change + twist a macro).
2. Stop → open take → check Performance Memory markers (Project, transport) and timeline.
3. Confirm inferred pattern-hint markers (if any) say **inferred** and look dashed.
4. Rename / delete a marker; jump play from a marker; set trim and **Send trim to FLIP**.
5. Sections: leave event-actions **off** — Replay bridge on a project event does nothing outbound from Memory.
6. Turn event-actions **on** — Replay bridge only for confirmed project rows (still needs Bridge on + ports).

## Limits

Device parameter state is not read back. Pattern-change / mute labels are guesses. Rate of timeline events is bounded (~2000). Older takes have no timeline until re-recorded.
