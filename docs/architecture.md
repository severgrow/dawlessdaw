# Dawlessdaw Architecture (v0.1)

Brief map of the running system.

## Layers

```
apps/web (React UI)
    ↓ useSyncExternalStore
StudioRuntime (wiring)
    ├── StudioEventBus     (@dawlessdaw/events) — typed, bounded; clock partitioned
    ├── HardwareTransport  (@dawlessdaw/midi)   — Web | Mock | NativeBridge stub
    ├── MidiRoutingEngine  (@dawlessdaw/routing)
    ├── FocusEngine        (@dawlessdaw/focus)
    ├── DeviceRegistry     (@dawlessdaw/devices)
    ├── RoleResolver + Arranger + SceneStore (@dawlessdaw/scenes)
    ├── Sessions           (@dawlessdaw/sessions)
    └── Repository         (@dawlessdaw/storage) — IndexedDB / Memory
```

## Data flow

1. Transport receives MIDI → `midi:in` on the bus (clock → separate history).
2. Routing engine transforms and fans out to destinations (feedback prevention, note-off tracking).
3. Focus engine observes non-clock activity → Follow / Smart / Manual.
4. UI subscribes via `onUi` / runtime snapshot — never per clock tick.

## Workspaces

Studio · Patchbay · Performance · Library · Sessions · Settings

## Extension

`AssistantToolRegistry` is a host extension point only — no AI dependency.

## Device-specific adapters (optional)

Deeper integrations live under `@dawlessdaw/devices` (e.g. `circuit-rhythm/`) and must:

- Declare capability honesty statuses
- Remain optional — core router works with generic MIDI alone
- Never require custom firmware for baseline routing

See `docs/hardware-integration/` for research-backed limits (MPC Plugin SDK cannot MIDI-out; Circuit Scene ≠ Project PGM; ZED has no MIDI).
