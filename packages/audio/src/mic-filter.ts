/**
 * Built-in / Continuity / phone mics are never selectable capture inputs.
 * Prefer Scarlett / ZED / USB interfaces. Shared by Fake + Worklet backends
 * and Session/FLIP pickers (apps/web re-exports).
 */

/** MacBook / iPhone / Continuity / laptop built-ins — never offer as capture inputs. */
export function isBuiltInOrPhoneMic(label: string, deviceId = ''): boolean {
  const id = deviceId.toLowerCase();
  if (id === 'default' || id === 'communications') return true;

  const l = label.toLowerCase().trim();
  if (!l) return false;

  if (
    /macbook|imac\b|mac\s*mini|mac\s*pro|built-?in|internal\s*(microphone|mic)\b|iphone|ipad|continuity|facetime|microphone\s*array|default\s*[-–:].*mic|laptop.*(mic|microphone)|system\s*(microphone|mic)\b/.test(
      l,
    )
  ) {
    return true;
  }

  // "Microphone (MacBook Pro)" / "Apple Inc. MacBook Air Microphone"
  if (/microphone|mic\b/.test(l) && /(apple|mac\b|iphone|ipad|continuity)/.test(l)) {
    return true;
  }

  return false;
}

export function isPreferredInterface(label: string): boolean {
  const l = label.toLowerCase();
  return /scarlett|focusrite|zed|allen\s*&?\s*heath|usb\s*audio|sp-?404|roland|motu|audient|ssl\b|apollo|zoom\s*u|behringer|m-?audio/.test(
    l,
  );
}

/** Drop built-ins; prefer USB interfaces first. */
export function filterSelectableAudioInputs<T extends { label: string; deviceId: string }>(
  devices: T[],
): T[] {
  return devices
    .filter((d) => !isBuiltInOrPhoneMic(d.label, d.deviceId))
    .sort((a, b) => {
      const pa = isPreferredInterface(a.label) ? 0 : 1;
      const pb = isPreferredInterface(b.label) ? 0 : 1;
      return pa - pb || a.label.localeCompare(b.label);
    });
}
