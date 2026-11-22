import { describe, it, expect } from 'vitest';
import {
  MONITOR_INPUT_DEFAULT,
  gatePlayWhileRecording,
  gateRecordWhilePlaying,
} from './feedback';

describe('FLIP feedback safety', () => {
  it('monitor defaults OFF', () => {
    expect(MONITOR_INPUT_DEFAULT).toBe(false);
  });

  it('blocks record while playing unless advanced resample', () => {
    const blocked = gateRecordWhilePlaying({
      playing: true,
      allowPlayWhileRec: false,
      monitorInput: false,
    });
    expect(blocked.allow).toBe(false);
    expect(blocked.reason).toMatch(/blocked/i);

    const allowed = gateRecordWhilePlaying({
      playing: true,
      allowPlayWhileRec: true,
      monitorInput: false,
    });
    expect(allowed.allow).toBe(true);
    expect(allowed.warnPlaybackReentry).toBe(true);
  });

  it('blocks play while recording unless advanced resample', () => {
    const blocked = gatePlayWhileRecording({
      recording: true,
      allowPlayWhileRec: false,
    });
    expect(blocked.allow).toBe(false);

    const allowed = gatePlayWhileRecording({
      recording: true,
      allowPlayWhileRec: true,
    });
    expect(allowed.allow).toBe(true);
  });
});
