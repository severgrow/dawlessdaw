# Module & adapter API

## HardwareTransport

```ts
interface HardwareTransport {
  readonly name: string;
  readonly kind: 'web-midi' | 'mock' | 'native-bridge';
  start(): Promise<void>;
  stop(): Promise<void>;
  listPorts(): MidiPortInfo[];
  send(portId: PortId, data: Uint8Array, timestamp?: number): void;
  onMessage(handler: MidiInputHandler): () => void;
  onPortsChanged(handler: PortChangeHandler): () => void;
  isAvailable(): boolean;
}
```

Implementations: `WebMidiTransport`, `MockMidiTransport`, `NativeBridgeTransport` (stub).

## DeviceAdapter

```ts
interface DeviceAdapter {
  readonly kind: DeviceKind;
  readonly profile: DeviceProfile;
  createDevice(id, ports): StudioDevice;
  matchPortName(name: string): boolean;
  interpret?(message: MidiMessage): Record<string, unknown> | null;
}
```

Adapters live in `@nervos/devices`. Registry `syncFromPorts` / `seedSimulation` builds `StudioDevice` records.

## CapabilityStatus

`verified` | `untested` | `experimental` | `unavailable` | `unknown`

## Roles & arranger

- `RoleResolver` — Circuit tracks → musical roles → destination ports
- `ConfigurableArrangerProvider` — Circuit configurable; `hardwareSceneSync` always `false`

## Scenes & sessions

- `StudioScene` — routes, roles, focus, arranger; validated on save
- `NervosSession` — `schemaVersion: 1` JSON import/export

## AssistantTool

```ts
interface AssistantTool {
  id: string;
  name: string;
  description: string;
  execute(args, ctx: AssistantToolContext): Promise<unknown> | unknown;
}
```

Register via `StudioRuntime.assistant` — no LLM bundled.
