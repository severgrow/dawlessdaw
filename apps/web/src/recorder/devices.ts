/**
 * Enumerate all browser audio inputs for Session Recorder.
 * Hints for ZED / Scarlett / SP when the OS label matches — any input is selectable.
 */
import { RECORDER_INPUT_KEY, type AudioInputDevice } from './types';

export function hintForLabel(label: string): AudioInputDevice['hint'] {
  const l = label.toLowerCase();
  if (/zed|allen\s*&?\s*heath/.test(l)) return 'zed';
  if (/scarlett|focusrite|2i[24]|2i2|4i4|8i6|18i/.test(l)) return 'scarlett';
  if (/sp-?404|roland.*404|404mk/.test(l)) return 'sp404';
  return 'other';
}

export function formatInputLabel(device: AudioInputDevice): string {
  const tag =
    device.hint === 'zed'
      ? ' · ZED'
      : device.hint === 'scarlett'
        ? ' · Scarlett'
        : device.hint === 'sp404'
          ? ' · SP-404'
          : '';
  return `${device.label || 'Audio input'}${tag}`;
}

export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  // Labels are empty until permission — a quick getUserMedia unlocks them.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const t of stream.getTracks()) t.stop();
  } catch {
    // Still list devices; labels may be blank.
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Input ${d.deviceId.slice(0, 8)}`,
      hint: hintForLabel(d.label || ''),
    }));
}

export function loadPersistedInputId(): string | null {
  try {
    return localStorage.getItem(RECORDER_INPUT_KEY);
  } catch {
    return null;
  }
}

export function persistInputId(deviceId: string): void {
  try {
    localStorage.setItem(RECORDER_INPUT_KEY, deviceId);
  } catch {
    // ignore
  }
}
