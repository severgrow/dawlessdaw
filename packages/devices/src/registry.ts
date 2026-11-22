import type { DeviceId, MidiPortInfo, PortId, StudioDevice } from '@nervos/core';
import { DEVICE_PROFILES } from './profiles';
import {
  CircuitRhythmAdapter,
  MpcOneAdapter,
  MVaveFm1Adapter,
  Sp404Adapter,
  Zed10fxAdapter,
  type DeviceAdapter,
} from './adapter';

export class DeviceRegistry {
  private devices = new Map<DeviceId, StudioDevice>();
  private adapters: DeviceAdapter[];
  private portToDevice = new Map<PortId, DeviceId>();

  constructor() {
    this.adapters = [
      new MpcOneAdapter(DEVICE_PROFILES['mpc-one']!),
      new Sp404Adapter(DEVICE_PROFILES['sp404mkii-stock']!),
      new CircuitRhythmAdapter(DEVICE_PROFILES['circuit-rhythm']!),
      new MVaveFm1Adapter(DEVICE_PROFILES['m-vave-fm1']!),
      new Zed10fxAdapter(DEVICE_PROFILES['zed-10fx']!),
    ];
  }

  getAdapters(): DeviceAdapter[] {
    return [...this.adapters];
  }

  getAdapter(kind: string): DeviceAdapter | undefined {
    return this.adapters.find((a) => a.kind === kind);
  }

  list(): StudioDevice[] {
    return [...this.devices.values()];
  }

  get(id: DeviceId): StudioDevice | undefined {
    return this.devices.get(id);
  }

  upsert(device: StudioDevice): void {
    this.devices.set(device.id, device);
    for (const p of [...device.inputPortIds, ...device.outputPortIds]) {
      this.portToDevice.set(p, device.id);
    }
  }

  remove(id: DeviceId): void {
    const d = this.devices.get(id);
    if (d) {
      for (const p of [...d.inputPortIds, ...d.outputPortIds]) {
        this.portToDevice.delete(p);
      }
    }
    this.devices.delete(id);
  }

  deviceForPort(portId: PortId): DeviceId | undefined {
    return this.portToDevice.get(portId);
  }

  /**
   * Match ports to adapters and refresh registry.
   * Unmatched MIDI ports become generic entries.
   */
  syncFromPorts(ports: MidiPortInfo[]): StudioDevice[] {
    // Keep ZED (non-MIDI) if present
    const zed = [...this.devices.values()].filter((d) => d.kind === 'zed-10fx');

    const byKind = new Map<string, { inputs: PortId[]; outputs: PortId[]; name: string }>();

    for (const port of ports) {
      if (port.state !== 'connected') continue;
      const adapter = this.adapters.find((a) => a.profile.hasMidi && a.matchPortName(port.name));
      const key = adapter?.kind ?? `generic:${port.name}`;
      let bucket = byKind.get(key);
      if (!bucket) {
        bucket = { inputs: [], outputs: [], name: port.name };
        byKind.set(key, bucket);
      }
      if (port.type === 'input') bucket.inputs.push(port.id);
      else bucket.outputs.push(port.id);
    }

    this.devices.clear();
    this.portToDevice.clear();

    for (const [key, bucket] of byKind) {
      const adapter = this.adapters.find((a) => a.kind === key);
      if (adapter) {
        const id = `device:${adapter.kind}`;
        this.upsert(adapter.createDevice(id, bucket));
      } else {
        const id = `device:generic:${bucket.name}`;
        this.upsert({
          id,
          kind: 'generic-midi',
          displayName: bucket.name,
          inputPortIds: bucket.inputs,
          outputPortIds: bucket.outputs,
          connected: true,
          capabilities: [
            { id: 'midi-io', label: 'Generic MIDI', status: 'unknown' },
          ],
          midiEnabled: true,
        });
      }
    }

    for (const z of zed) this.upsert(z);
    return this.list();
  }

  /** Register the audio-only mixer into the studio. */
  ensureZed(): StudioDevice {
    const existing = [...this.devices.values()].find((d) => d.kind === 'zed-10fx');
    if (existing) return existing;
    const adapter = this.getAdapter('zed-10fx') as Zed10fxAdapter;
    const device = adapter.createDevice('device:zed-10fx', { inputs: [], outputs: [] });
    this.upsert(device);
    return device;
  }

  /** Seed mock studio devices for simulation. */
  seedSimulation(): StudioDevice[] {
    const mpc = this.getAdapter('mpc-one')!.createDevice('device:mpc-one', {
      inputs: ['mock-mpc-in'],
      outputs: ['mock-mpc-out'],
    });
    const sp = (this.getAdapter('sp404mkii') as Sp404Adapter).createDevice('device:sp404mkii', {
      inputs: ['mock-sp404-in'],
      outputs: ['mock-sp404-out'],
    });
    const circuit = this.getAdapter('circuit-rhythm')!.createDevice('device:circuit-rhythm', {
      inputs: ['mock-circuit-in'],
      outputs: ['mock-circuit-out'],
    });
    const fm1 = this.getAdapter('m-vave-fm1')!.createDevice('device:m-vave-fm1', {
      inputs: ['mock-fm1-in'],
      outputs: ['mock-fm1-out'],
    });
    const zed = this.ensureZed();
    for (const d of [mpc, sp, circuit, fm1, zed]) this.upsert(d);
    return this.list();
  }
}
