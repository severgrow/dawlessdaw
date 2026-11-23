# Desktop installer (Mac)

Splot MIDI Brain ships as an **Electron** Mac app that loads the same Vite web UI (Chromium Web MIDI + Web Audio — same stack as Chrome).

## For you (download / update)

See the short store note: download the `.dmg` from [GitHub Releases](https://github.com/severgrow/dawlessdaw/releases), install once, and let the app pull later updates. No Terminal / `npm` on each update.

## Maintainers

| Command | What |
|---------|------|
| `npm run build:desktop` | Vite build with `base: './'` for the shell |
| `npm run desktop` | Build web + launch Electron locally |
| `npm run dist:mac` | Build + electron-builder DMG/ZIP (needs macOS) |

Release: push a tag `v*` (e.g. `v0.1.0`). Workflow `.github/workflows/desktop-release.yml` builds on `macos-latest` and publishes to Releases. `electron-updater` reads that feed (`severgrow/dawlessdaw`).

Optional repo secrets for signed/notarized builds: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Unsigned builds still install via Right-click → Open.

Code: `apps/desktop/` (main, permissions, update feed, entitlements).
