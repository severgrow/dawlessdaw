/**
 * Enumerate browser audio inputs for Session Recorder / FLIP / Timing Lab.
 * Built-in / Continuity / iPhone mics are never selectable — prefer Scarlett / ZED / USB.
 *
 * Filter helpers live in `@dawlessdaw/audio` (AudioBackend seam); re-exported here
 * so FLIP/Sessions pickers keep the same import paths.
 */
import {
  filterSelectableAudioInputs as filterSelectableAudioInputsBase,
  isBuiltInOrPhoneMic,
  isPreferredInterface,
} from '@dawlessdaw/audio';
import { RECORDER_INPUT_KEY, type AudioInputDevice } from './types';

export { isBuiltInOrPhoneMic, isPreferredInterface } from '@dawlessdaw/audio';

/** Empty-picker copy when only a laptop/phone mic exists (or nothing). */
export const PLUG_IN_INTERFACE = 'Plug in an interface';

export function hintForLabel(label: string): AudioInputDevice['hint'] {
  const l = label.toLowerCase();
  if (/zed|allen\s*&?\s*heath/.test(l)) return 'zed';
  if (/scarlett|focusrite|2i[24]|2i2|4i4|8i6|18i/.test(l)) return 'scarlett';
  if (/sp-?404|roland.*404|404mk/.test(l)) return 'sp404';
  return 'other';
}

/** Drop built-ins; prefer Scarlett / ZED / USB interfaces first (hint tie-break). */
export function filterSelectableAudioInputs<T extends { label: string; deviceId: string }>(
  devices: T[],
): T[] {
  return filterSelectableAudioInputsBase(devices).sort((a, b) => {
    const pa = isPreferredInterface(a.label) ? 0 : hintForLabel(a.label) !== 'other' ? 1 : 2;
    const pb = isPreferredInterface(b.label) ? 0 : hintForLabel(b.label) !== 'other' ? 1 : 2;
    return pa - pb || a.label.localeCompare(b.label);
  });
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

/**
 * Prefer an interface for the brief permission unlock — never leave a built-in mic open.
 * Returns null when only built-ins / nothing is available.
 */
export function pickPreferredInputId(
  devices: Array<{ label: string; deviceId: string }>,
  savedId?: string | null,
): string | null {
  const list = filterSelectableAudioInputs(devices);
  if (savedId && list.some((d) => d.deviceId === savedId)) return savedId;
  return list[0]?.deviceId ?? null;
}

export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  // Labels are empty until permission. Prefer unlocking on an interface, never keep a built-in.
  try {
    let probeId: string | null = null;
    try {
      const pre = await navigator.mediaDevices.enumerateDevices();
      probeId = pickPreferredInputId(
        pre
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || '' })),
        loadPersistedInputId(),
      );
    } catch {
      probeId = null;
    }

    // If we only see built-ins (or blank labels), still need one short permission grant for labels —
    // then we filter them out. Stop the track immediately; UI never selects a built-in.
    const audio: MediaTrackConstraints = probeId
      ? { deviceId: { exact: probeId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    for (const t of stream.getTracks()) t.stop();
  } catch {
    // Still list devices; labels may be blank.
  }

  const all = await navigator.mediaDevices.enumerateDevices();
  const mapped = all
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Input ${d.deviceId.slice(0, 8)}`,
      hint: hintForLabel(d.label || ''),
    }));

  return filterSelectableAudioInputs(mapped);
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

export function clearPersistedInputId(): void {
  try {
    localStorage.removeItem(RECORDER_INPUT_KEY);
  } catch {
    // ignore
  }
}
