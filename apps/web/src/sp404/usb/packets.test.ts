import { describe, expect, it } from 'vitest';
import { isReadOnlyAllowed } from './allowlist';
import { formatSamplePath, padId, parseSysExResponse, sysexOpenRead } from './packets';

describe('SP USB packets', () => {
  it('maps pads A01 / D16 to protocol IDs', () => {
    expect(padId('A', 1)).toBe(0x00);
    expect(padId('B', 1)).toBe(0x10);
    expect(padId('D', 16)).toBe(0x3f);
  });

  it('formats flash sample paths like open404', () => {
    expect(formatSamplePath(1, 'A', 1)).toBe(
      '/SP404REMOTE///ROLAND\\SP-404MKII\\PROJECT_01/SMPL\\BANK1-01.SMP',
    );
    expect(formatSamplePath(3, 'E', 11)).toBe(
      '/SP404REMOTE///ROLAND\\SP-404MKII\\PROJECT_03/SMPL\\BANK5-11.SMP',
    );
  });

  it('open-read frames stay on the allow-list', () => {
    const frame = sysexOpenRead(0x10000001, formatSamplePath(1, 'A', 1));
    expect(isReadOnlyAllowed(frame)).toBe(true);
    expect(frame[16]).toBe(0xf0);
    expect(frame[20]).toBe(0x00); // open
    expect(frame[24]).toBe(0x00); // read flag
    expect(frame[25]).toBe(0x00);
  });

  it('parses SysEx ACK success / reject', () => {
    const ack = Uint8Array.from([
      0x13, 0xe0, 0x60, 0x06, 0, 0, 0, 0, 1, 0, 0, 0, 15, 0, 0, 0, 0xf0, 0x41, 0x7a, 0x7a, 0, 0, 0, 0, 0x05, 0, 0, 0,
      0, 0x08, 0xf7,
    ]);
    const parsed = parseSysExResponse(ack);
    expect(parsed?.isAck).toBe(true);
    expect(parsed?.handle).toBe(0x05);

    const nack = Uint8Array.from([
      0x13, 0xe0, 0x60, 0x06, 0, 0, 0, 0, 1, 0, 0, 0, 15, 0, 0, 0, 0xf0, 0x41, 0x7a, 0x7a, 0, 0, 0, 0, 0x7f, 0, 0, 0,
      0, 0x11, 0xf7,
    ]);
    const bad = parseSysExResponse(nack);
    expect(bad?.isAck).toBe(false);
    expect(bad?.handle).toBe(0);
  });
});
