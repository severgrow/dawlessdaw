/**
 * Electron session permission allowlist for Splot MIDI Brain.
 * Web MIDI + session/FLIP audio capture only — nothing else.
 */

/** @type {ReadonlySet<string>} */
export const DESKTOP_PERMISSIONS = new Set([
  'midi',
  'midiSysex', // Deep Sync may request; production routing still uses sysex:false
  'media',
  'microphone',
  'audioCapture',
]);

/**
 * @param {string} permission
 * @returns {boolean}
 */
export function isDesktopPermissionAllowed(permission) {
  return DESKTOP_PERMISSIONS.has(permission);
}
