import { describe, expect, it } from 'vitest';
import {
  IMPORT_DIR_NAME,
  SP_IMPORT_HINT,
  clampPadNumber,
  importDestinationLabel,
  importRelativePath,
  importWavFileName,
  isImportDirName,
  parsePadKey,
  resolveImportDirName,
  sampleNameFromTake,
} from './spImportPath';

describe('SP IMPORT path helpers', () => {
  it('builds IMPORT-relative WAV paths by pad', () => {
    expect(importWavFileName('A', 1, 'Kick 01.wav')).toBe('A01 Kick 01.wav');
    expect(importRelativePath('A', 1, 'Kick 01.wav')).toBe('IMPORT/A01 Kick 01.wav');
    expect(importRelativePath('J', 16, 'loop')).toBe('IMPORT/J16 loop.wav');
    expect(IMPORT_DIR_NAME).toBe('IMPORT');
  });

  it('clamps pad numbers into 1–16', () => {
    expect(clampPadNumber(0)).toBe(1);
    expect(clampPadNumber(99)).toBe(16);
    expect(importRelativePath('B', 0, 'x')).toBe('IMPORT/B01 x.wav');
    expect(importRelativePath('B', 20, 'x')).toBe('IMPORT/B16 x.wav');
  });

  it('parses pad keys A01–J16', () => {
    expect(parsePadKey('A01')).toEqual({ bank: 'A', pad: 1 });
    expect(parsePadKey('j16')).toEqual({ bank: 'J', pad: 16 });
    expect(parsePadKey('C7')).toEqual({ bank: 'C', pad: 7 });
    expect(parsePadKey('K01')).toBeNull();
    expect(parsePadKey('A00')).toBeNull();
    expect(parsePadKey('A17')).toBeNull();
    expect(parsePadKey('')).toBeNull();
  });

  it('resolves IMPORT folder name case-insensitively', () => {
    expect(isImportDirName('IMPORT')).toBe(true);
    expect(isImportDirName('Import')).toBe(true);
    expect(isImportDirName('import')).toBe(true);
    expect(isImportDirName('EXPORT')).toBe(false);
    expect(resolveImportDirName(['EXPORT', 'Import', 'BKUP'])).toBe('Import');
    expect(resolveImportDirName(['EXPORT', 'BKUP'])).toBe('IMPORT');
  });

  it('labels the destination pad and keeps the Import hint honest', () => {
    expect(importDestinationLabel('D', 4, 'jam take')).toBe('D04 → IMPORT/D04 jam take.wav');
    expect(sampleNameFromTake('Café / groove:01.wav')).toBe('Cafe groove 01');
    expect(SP_IMPORT_HINT).toMatch(/SHIFT \+ pad 14 Import/i);
  });
});
