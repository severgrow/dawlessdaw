# Hardware-Feel UX — Pass A (audit)

**Status:** audit only · stacked on A5 tip · **do not merge**  
**Full write-up + screenshots (agent store):**  
`/cursor/stores/self/docs/hardware-feel-pass-a-audit.md`  
`/cursor/stores/self/media/hardware-feel-pass-a/`  
Brief: `/cursor/stores/self/docs/hardware-feel-ux-brief.md`

## Top 10 friction (summary)

1. **No MIDI / allow Chrome repeated 4–6×** — one next-action needed (**Pass B**, quick)  
2. **CONNECT ≠ wizard** — lands on Settings silently (**B**, quick)  
3. **Wizard can’t grant MIDI; steps 2–3 weak** — improve existing onboarding (**B**, quick)  
4. **Settings empty still shows full port grid + Unknown Devices form** (**C**, quick empty-state / larger progressive disclosure)  
5. **DeviceStrip failure dashboard** on first paint (**B/C**, larger)  
6. **Build title vs Circuit Live mode + jargon** (**D**, larger)  
7. **Sessions: Capture last N outranks Record** (**D**, quick demote)  
8. **Duplicate Panic / loud burgundy** (**B/E**, quick)  
9. **Mobile overflow / truncated nav** (**B→E**, larger)  
10. **No selection carry** Rig→Controller / CONNECT→Settings (**C**, larger)

## Pass B–D touch map (no collisions)

| Pass | Files (primary) |
|------|-----------------|
| **B** Nav / header / next-action | `ConnectWizard.tsx`, `StatusBar.tsx`, `TransportStrip.tsx`, `Nav.tsx`, `nav/tabs.ts`, `DeviceStrip.tsx`, `App.tsx`, `studio.css` |
| **C** Rig / Controller / Setup | `RigWorkspace.tsx`, `RigMap.tsx`, `ControllerWorkspace.tsx`, `MidiLearnGlass.tsx`, `SetupWorkspace.tsx` |
| **D** Sequencer / Sessions / FLIP | `SequencerWorkspace.tsx`, `FlipLane.tsx`, `SessionsWorkspace.tsx`, `CaptureLastBars.tsx`, `CircuitIntelligencePanel.tsx` |

**Protect:** routing/clock defaults, SysEx policy, built-in mic filter, music engines.

## Checks

Audit-only PR — `npm test` / typecheck / build / smoke still green on tip (no product code change beyond this doc).
