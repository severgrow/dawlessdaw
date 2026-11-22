# NervOS v0.1

Local-first web application for hardware music studio connectivity.

**Simulation mode is the default.** Live Web MIDI is optional (Chrome / Edge on macOS).

## Quick start (macOS + Chrome)

```bash
cd nervos
npm install
npm run dev
```

Open `http://localhost:5173`. Allow MIDI if prompted when switching to Live.

```bash
npm test
```

## Stack

- React + TypeScript + Vite
- Zustand-style store via `useSyncExternalStore` over `StudioRuntime`
- IndexedDB repository interface (Memory fallback; SQLite later)
- Web MIDI + MockMidiTransport (+ NativeBridgeTransport stub)
- Vitest

## Packages

| Package | Role |
|---------|------|
| `@nervos/core` | Types, MIDI parse, AssistantTool extension point |
| `@nervos/events` | Typed studio event bus (clock partitioned) |
| `@nervos/midi` | HardwareTransport implementations |
| `@nervos/routing` | MIDI routing engine |
| `@nervos/focus` | Follow / Smart / Manual focus |
| `@nervos/devices` | Registry + adapters (MPC, SP-404, Circuit, FM1, ZED) |
| `@nervos/scenes` | Scenes, roles, arranger provider |
| `@nervos/sessions` | Session JSON schema import/export |
| `@nervos/storage` | Repository interface + IndexedDB |
| `@nervos/web` | UI app |

## Docs

See `../docs/` in the Project store:

- architecture.md
- setup-macos.md
- device-connection.md
- module-adapter-api.md
- limitations.md
- next-steps.md

## Honesty

ZED-10FX has **no MIDI**. Circuit Scene Sync is **not** faked. Unverified firmware features are marked untested / experimental / unavailable / unknown.
