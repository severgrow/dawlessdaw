import { describe, expect, it, vi } from 'vitest';
import { FakeAudioBackend } from './fake-backend';

describe('FakeAudioBackend', () => {
  it('lists only selectable inputs (never MacBook / Continuity)', async () => {
    const backend = new FakeAudioBackend({
      inputs: [
        { deviceId: 'mac', label: 'MacBook Pro Microphone' },
        { deviceId: 'iphone', label: 'iPhone Microphone' },
        { deviceId: 'cont', label: 'Continuity Microphone' },
        { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
      ],
    });
    await backend.start();
    expect(backend.listInputs().map((d) => d.deviceId)).toEqual(['scarlett']);
    expect(backend.kind).toBe('fake');
    expect(backend.isAvailable()).toBe(true);
  });

  it('refuses to open a built-in even if forced by id', async () => {
    const backend = new FakeAudioBackend({
      inputs: [
        { deviceId: 'mac', label: 'MacBook Pro Microphone' },
        { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
      ],
    });
    await backend.start();
    await expect(backend.open({ deviceId: 'mac' })).rejects.toThrow(/Built-in|Continuity|non-selectable/i);
    await backend.open({ deviceId: 'scarlett' });
    expect(backend.isOpen()).toBe(true);
    expect(backend.getMonitorInput()).toBe(false);
    expect(backend.snapshot()).toMatchObject({
      kind: 'fake',
      open: true,
      deviceId: 'scarlett',
      monitorInput: false,
    });
  });

  it('defaults monitorInput off and delivers PCM to listeners', async () => {
    const backend = new FakeAudioBackend();
    await backend.start();
    const id = backend.listInputs()[0]!.deviceId;
    const frames: Float32Array[] = [];
    const unsub = backend.onPcm((pcm) => frames.push(pcm));

    await backend.open({ deviceId: id, monitorInput: false });
    expect(backend.getMonitorInput()).toBe(false);

    const block = new Float32Array([0.5, -0.25, 0.1, 0.2]);
    backend.pushPcm(block);
    expect(frames).toHaveLength(1);
    expect(backend.getMeters().left).toBeCloseTo(0.5);
    expect(backend.getMeters().right).toBeCloseTo(0.25);

    await backend.open({ deviceId: id, monitorInput: true });
    expect(backend.getMonitorInput()).toBe(true);

    unsub();
    await backend.stop();
    expect(backend.isOpen()).toBe(false);
  });

  it('notifies device listeners on start/rescan', async () => {
    const backend = new FakeAudioBackend();
    const seen: string[][] = [];
    backend.onDevicesChanged((inputs) => seen.push(inputs.map((d) => d.deviceId)));
    await backend.start();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    await backend.rescanInputs();
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });

  it('requires start before open', async () => {
    const backend = new FakeAudioBackend();
    await expect(backend.open({ deviceId: 'fake-scarlett-2i2' })).rejects.toThrow(/start/i);
  });

  it('generates timed PCM when pcmIntervalMs set', async () => {
    vi.useFakeTimers();
    const backend = new FakeAudioBackend({
      pcmIntervalMs: 10,
      amplitude: 0.25,
    });
    await backend.start();
    const id = backend.listInputs()[0]!.deviceId;
    let count = 0;
    backend.onPcm(() => {
      count += 1;
    });
    await backend.open({ deviceId: id });
    await vi.advanceTimersByTimeAsync(35);
    expect(count).toBeGreaterThanOrEqual(2);
    await backend.close();
    vi.useRealTimers();
  });
});
