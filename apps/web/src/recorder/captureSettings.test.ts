import { describe, expect, it } from 'vitest';
import {
  assessCaptureHonesty,
  buildCaptureConstraints,
  readTrackSettings,
} from './captureSettings';

describe('captureSettings P4 honesty', () => {
  it('buildCaptureConstraints disables AGC/NS/AEC', () => {
    const c = buildCaptureConstraints('scarlett');
    expect(c.echoCancellation).toBe(false);
    expect(c.noiseSuppression).toBe(false);
    expect(c.autoGainControl).toBe(false);
    expect(c.deviceId).toEqual({ exact: 'scarlett' });
  });

  it('flags processing leak when getSettings reports AGC on', () => {
    const reported = readTrackSettings({
      getSettings: () =>
        ({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 2,
          sampleRate: 48000,
          deviceId: 'scarlett',
        }) as MediaTrackSettings,
    });
    const h = assessCaptureHonesty('scarlett', reported, 48000);
    expect(h.processingLeak).toBe(true);
    expect(h.sampleFormat).toBe('float32-worklet');
    expect(h.notes.toLowerCase()).toMatch(/cautious|agc|autogain/);
  });

  it('never claims 24-bit from getUserMedia path', () => {
    const h = assessCaptureHonesty('x', {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
      deviceId: 'x',
    });
    expect(h.sampleFormat).toBe('float32-worklet');
    expect(h.processingLeak).toBe(false);
  });
});
