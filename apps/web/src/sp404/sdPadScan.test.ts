import { describe, expect, it } from 'vitest';
import {
  buildProjectScan,
  findProjectDirs,
  formatPadDuration,
  parseBankSmpFileName,
  parsePadconf,
  parseRfwvHeader,
  smpFileName,
  type ListedEntry,
} from './sdPadScan';

function putBe(buf: Uint8Array, at: number, value: number): void {
  buf[at] = (value >>> 24) & 0xff;
  buf[at + 1] = (value >>> 16) & 0xff;
  buf[at + 2] = (value >>> 8) & 0xff;
  buf[at + 3] = value & 0xff;
}

function writeAscii(buf: Uint8Array, at: number, s: string): void {
  for (let i = 0; i < s.length; i++) buf[at + i] = s.charCodeAt(i);
}

/** Minimal RFPD v3 with one occupied pad (A01) and a name on B01. */
function fakePadconfV3(): Uint8Array {
  const buf = new Uint8Array(52_000);
  writeAscii(buf, 0, 'RFPD');
  putBe(buf, 4, 0xa0);
  buf[8] = 3;
  putBe(buf, 0x0c, 0x7a80);
  writeAscii(buf, 0x80, 'DEMO_KIT');

  // A01 occupied: end/start/endAlt
  const recA01 = 0xa0;
  putBe(buf, recA01, 98_304);
  putBe(buf, recA01 + 4, 512);
  putBe(buf, recA01 + 8, 98_304);
  writeAscii(buf, 0x6c20, 'Kick');

  // B01 name only — still occupied via start/end
  const b1 = 16;
  const recB01 = 0xa0 + b1 * 172;
  putBe(buf, recB01, 200_000);
  putBe(buf, recB01 + 4, 512);
  putBe(buf, recB01 + 8, 200_000);
  writeAscii(buf, 0x6c20 + b1 * 24, 'Bass');

  return buf;
}

/** open404-style RFWV header for 1 s stereo 16-bit @ 48 kHz. */
function fakeRfwv(pcmBytes: number, channels = 2): Uint8Array {
  const buf = new Uint8Array(512);
  writeAscii(buf, 0, 'RFWV');
  putBe(buf, 4, pcmBytes + 512 - 8);
  putBe(buf, 8, 48_000);
  putBe(buf, 12, channels);
  putBe(buf, 16, 16);
  return buf;
}

describe('SP SD pad scan', () => {
  it('parses BANK*-*.SMP file names', () => {
    expect(parseBankSmpFileName('BANK1-01.SMP')).toEqual({ bank: 'A', pad: 1 });
    expect(parseBankSmpFileName('BANK10-16.SMP')).toEqual({ bank: 'J', pad: 16 });
    expect(parseBankSmpFileName('BANK-2-03.SMP')).toEqual({ bank: 'B', pad: 3 });
    expect(parseBankSmpFileName('kick.wav')).toBeNull();
    expect(parseBankSmpFileName('BANK99-01.SMP')).toBeNull();
    expect(smpFileName('C', 4)).toBe('BANK3-04.SMP');
  });

  it('parses RFWV headers for length and channels', () => {
    const stereo1s = fakeRfwv(48_000 * 2 * 2);
    const info = parseRfwvHeader(stereo1s);
    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(48_000);
    expect(info!.channels).toBe(2);
    expect(info!.durationSec).toBeCloseTo(1, 5);
    expect(parseRfwvHeader(new Uint8Array(100))).toBeNull();
    expect(parseRfwvHeader(new Uint8Array(512))).toBeNull(); // no magic
  });

  it('parses PADCONF.BIN names and empty vs occupied', () => {
    const parsed = parsePadconf(fakePadconfV3());
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(3);
    expect(parsed!.projectName).toBe('DEMO_KIT');
    const a01 = parsed!.pads.find((p) => p.key === 'A01')!;
    const a02 = parsed!.pads.find((p) => p.key === 'A02')!;
    const b01 = parsed!.pads.find((p) => p.key === 'B01')!;
    expect(a01.occupied).toBe(true);
    expect(a01.name).toBe('Kick');
    expect(a02.occupied).toBe(false);
    expect(a02.name).toBe('');
    expect(b01.occupied).toBe(true);
    expect(b01.name).toBe('Bass');
  });

  it('finds EXPORT and IMPORT project folders from a listing', () => {
    const entries: ListedEntry[] = [
      { path: 'IMPORT', kind: 'directory' },
      { path: 'EXPORT', kind: 'directory' },
      { path: 'EXPORT/PROJECT', kind: 'directory' },
      { path: 'EXPORT/PROJECT/PROJECT_01', kind: 'directory' },
      { path: 'EXPORT/PROJECT/PROJECT_01/PADCONF.BIN', kind: 'file', size: 52000 },
      { path: 'EXPORT/PROJECT/PROJECT_01/SMPL', kind: 'directory' },
      { path: 'EXPORT/PROJECT/PROJECT_01/SMPL/BANK1-01.SMP', kind: 'file', size: 1000 },
      { path: 'IMPORT/PROJECT_MYKIT', kind: 'directory' },
      { path: 'IMPORT/PROJECT_MYKIT/SMPL', kind: 'directory' },
      { path: 'IMPORT/PROJECT_MYKIT/SMPL/BANK1-02.SMP', kind: 'file', size: 500 },
      { path: 'BKUP', kind: 'directory' },
    ];
    const found = findProjectDirs(entries);
    expect(found).toContain('EXPORT/PROJECT/PROJECT_01');
    expect(found).toContain('IMPORT/PROJECT_MYKIT');
  });

  it('merges PADCONF + SMPL into a project scan', () => {
    const padconf = parsePadconf(fakePadconfV3())!;
    const rfwv = parseRfwvHeader(fakeRfwv(48_000 * 2 * 2))!;
    const scan = buildProjectScan({
      path: 'EXPORT/PROJECT/PROJECT_01',
      padconf,
      smplFiles: {
        A01: { fileName: 'BANK1-01.SMP', fileBytes: 512 + 192_000, rfwv },
      },
    });
    expect(scan.source).toBe('export');
    expect(scan.projectName).toBe('DEMO_KIT');
    expect(scan.occupiedCount).toBe(2);
    const a01 = scan.pads.find((p) => p.key === 'A01')!;
    expect(a01.occupied).toBe(true);
    expect(a01.name).toBe('Kick');
    expect(a01.fileName).toBe('BANK1-01.SMP');
    expect(a01.durationSec).toBeCloseTo(1, 5);
    expect(a01.channels).toBe(2);
    expect(scan.pads.find((p) => p.key === 'A02')!.occupied).toBe(false);
  });

  it('formats durations for the UI', () => {
    expect(formatPadDuration(1.234)).toBe('1.23 s');
    expect(formatPadDuration(12.34)).toBe('12.3 s');
    expect(formatPadDuration(65)).toBe('1:05');
    expect(formatPadDuration(null)).toBe('');
  });
});
