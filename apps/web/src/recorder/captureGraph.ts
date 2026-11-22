/**
 * Capture graph wiring policy for Session Recorder.
 *
 * MediaStreamSource must feed the AudioWorklet (PCM + meters) only.
 * Never route the live input to AudioContext.destination unless the user
 * explicitly enables Monitor input — AGC / echoCancellation are off, so
 * speaker monitoring feeds back into the take.
 */

export interface CaptureGraphPlan {
  /** Always: mic → worklet for raw PCM + meters. */
  sourceToWorklet: true;
  /**
   * Always: worklet → silent gain → destination so Chrome keeps the node
   * running. Worklet outputs must be zeros (no pass-through).
   */
  workletToSilentDestination: true;
  /** Only when Monitor input is ON. Default OFF. */
  sourceToDestination: boolean;
  monitorDefaultOn: false;
}

/** Default monitor state — off so the room cannot feed back into the take. */
export const MONITOR_INPUT_DEFAULT = false;

export const RECORDER_MONITOR_KEY = 'dawlessdaw.recorder.monitorInput';

export function planCaptureGraph(monitorInput: boolean): CaptureGraphPlan {
  return {
    sourceToWorklet: true,
    workletToSilentDestination: true,
    sourceToDestination: monitorInput === true,
    monitorDefaultOn: false,
  };
}

export function loadPersistedMonitorInput(): boolean {
  try {
    const v = localStorage.getItem(RECORDER_MONITOR_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // ignore
  }
  return MONITOR_INPUT_DEFAULT;
}

export function persistMonitorInput(on: boolean): void {
  try {
    localStorage.setItem(RECORDER_MONITOR_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}
