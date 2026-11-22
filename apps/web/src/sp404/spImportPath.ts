/**
 * Pure helpers for staging WAVs into an SP-404MKII SD card IMPORT folder.
 *
 * Browser can write files here (File System Access on a mounted card). Pads do
 * not load until the user runs SHIFT + pad 14 Import on the unit — no SysEx,
 * no live USB pad push.
 */

import {
  PADS_PER_BANK,
  SP_BANKS,
  cleanSampleName,
  padFileName,
  padKey,
  type SpBank,
} from './samplePrep';

/** Top-level folder on a formatted SP-404MKII SD card. */
export const IMPORT_DIR_NAME = 'IMPORT';

/** On-device gesture after files land in IMPORT/. */
export const SP_IMPORT_HINT = 'Then on SP: SHIFT + pad 14 Import';

export type SpPadRef = { bank: SpBank; pad: number };

export function isSpBank(value: string): value is SpBank {
  return (SP_BANKS as readonly string[]).includes(value);
}

export function clampPadNumber(pad: number): number {
  return Math.min(PADS_PER_BANK, Math.max(1, Math.round(pad)));
}

export function parsePadKey(raw: string): SpPadRef | null {
  const m = /^([A-J])(\d{1,2})$/i.exec(raw.trim());
  if (!m) return null;
  const bank = m[1]!.toUpperCase();
  if (!isSpBank(bank)) return null;
  const pad = Number(m[2]);
  if (!Number.isFinite(pad) || pad < 1 || pad > PADS_PER_BANK) return null;
  return { bank, pad };
}

/** WAV filename only, e.g. `A01 jam.wav`. */
export function importWavFileName(bank: SpBank, pad: number, sampleName: string): string {
  return padFileName(bank, clampPadNumber(pad), sampleName);
}

/**
 * Relative path from the SD volume root into IMPORT/.
 * Always uses the canonical uppercase `IMPORT/` segment (Roland card layout).
 */
export function importRelativePath(bank: SpBank, pad: number, sampleName: string): string {
  return `${IMPORT_DIR_NAME}/${importWavFileName(bank, pad, sampleName)}`;
}

/** Destination label for the Sessions readout. */
export function importDestinationLabel(bank: SpBank, pad: number, sampleName: string): string {
  const key = padKey(bank, clampPadNumber(pad));
  const file = importWavFileName(bank, pad, sampleName);
  return `${key} → ${IMPORT_DIR_NAME}/${file}`;
}

/**
 * Match IMPORT / Import / import folder names when listing a volume.
 * Create path always uses {@link IMPORT_DIR_NAME}.
 */
export function isImportDirName(name: string): boolean {
  return name.trim().toUpperCase() === IMPORT_DIR_NAME;
}

/** Prefer an existing IMPORT folder name casing; otherwise the canonical name. */
export function resolveImportDirName(existingNames: Iterable<string>): string {
  for (const name of existingNames) {
    if (isImportDirName(name)) return name;
  }
  return IMPORT_DIR_NAME;
}

/** Sanitize a take title into an SP-friendly sample name (max 24 ASCII). */
export function sampleNameFromTake(takeName: string): string {
  return cleanSampleName(takeName || 'session');
}
