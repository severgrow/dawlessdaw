# Hardware-Feel Pass F — regression smoke

Stacked on visual consistency (`cursor/visual-consistency-1768` / PR #69).

**Result:** no product regressions found; no engine/CSS redesign in this pass.

- Checklist + untested hardware notes: agent store `internal/hardware-feel-pass-f.md`
- Regression shots: agent store `media/hardware-feel-pass-f/`
- UI smoke script: `node scripts/pass-f-smoke.mjs` (Vite on `:5173`)
- Also: `npm test` · `npm run typecheck` · `npm run build` · `npm run smoke`

Do not merge until Patryk asks.
