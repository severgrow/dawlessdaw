import { describe, expect, it } from 'vitest';
import { createAudioBackend } from './create-backend';
import { MemoryWorkletHost, WorkletAudioBackend } from './worklet-backend';

describe('WorkletAudioBackend', () => {
  it('kind is worklet and filters built-in mics from listInputs', async () => {
    const host = new MemoryWorkletHost([
      { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
      { deviceId: 'mac', label: 'MacBook Pro Microphone' },
      { deviceId: 'phone', label: 'iPhone Microphone' },
    ]);
    const backend = new WorkletAudioBackend({ host });
    expect(backend.kind).toBe('worklet');
    await backend.start();
    expect(backend.listInputs().map((d) => d.deviceId)).toEqual(['scarlett']);
  });

  it('refuses opening Continuity / MacBook ids', async () => {
    const host = new MemoryWorkletHost([
      { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
      { deviceId: 'cont', label: 'Continuity Microphone' },
    ]);
    const backend = new WorkletAudioBackend({ host });
    await backend.start();
    await expect(backend.open({ deviceId: 'cont' })).rejects.toThrow(/Built-in|Continuity|non-selectable/i);
  });

  it('forwards PCM/meters from host and keeps monitor off by default', async () => {
    const host = new MemoryWorkletHost([{ deviceId: 'scarlett', label: 'Scarlett 2i2 USB' }]);
    const backend = new WorkletAudioBackend({ host });
    await backend.start();

    const pcm: Float32Array[] = [];
    backend.onPcm((b) => pcm.push(b));

    await backend.open({ deviceId: 'scarlett' });
    expect(backend.getMonitorInput()).toBe(false);
    expect(backend.snapshot().kind).toBe('worklet');

    host.pushMeters({ left: 0.3, right: 0.2, clipLeft: false, clipRight: false });
    expect(backend.getMeters().left).toBeCloseTo(0.3);

    host.pushPcm(new Float32Array([0.1, 0.2]));
    expect(pcm).toHaveLength(1);

    await backend.close();
    expect(backend.isOpen()).toBe(false);
  });

  it('createAudioBackend wires fake and worklet; rejects native-bridge', () => {
    const fake = createAudioBackend({ kind: 'fake' });
    expect(fake.kind).toBe('fake');

    const worklet = createAudioBackend({
      kind: 'worklet',
      worklet: { host: new MemoryWorkletHost() },
    });
    expect(worklet.kind).toBe('worklet');

    expect(() => createAudioBackend({ kind: 'native-bridge' })).toThrow(/Native audio bridge/i);
  });

  it('throws when host unavailable', async () => {
    const host = new MemoryWorkletHost([], { available: false });
    const backend = new WorkletAudioBackend({ host });
    expect(backend.isAvailable()).toBe(false);
    await expect(backend.start()).rejects.toThrow(/unavailable/i);
  });
});
