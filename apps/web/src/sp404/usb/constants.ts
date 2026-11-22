/** SP-404MKII USB CDC constants (from open404 MIT protocol docs). */

export const SP404_USB_VENDOR_ID = 0x0582;
export const SP404_USB_PRODUCT_ID = 0x02e7;

/** Firmware versions open404 verified. Anything else → warn + stay read-only. */
export const OPEN404_TESTED_FIRMWARES = ['5.51'] as const;

export const DEFAULT_BAUD = 115200;
export const KEEPALIVE_MS = 500;

export const MAGIC_SHORT = [0x12, 0x60, 0xe0, 0x05] as const;
export const MAGIC_PARAM = [0x13, 0x60, 0xe0, 0x05] as const;
export const MAGIC_SYSEX = [0x13, 0x60, 0xe0, 0x06] as const;
export const MAGIC_SYSEX_RESP = [0x13, 0xe0, 0x60, 0x06] as const;

export const WAKEUP = Uint8Array.from([
  0x12, 0x60, 0xe0, 0x05, 0xfe, 0x66, 0x00, 0x00, 0x70, 0x45, 0xc5, 0x03,
]);
export const KEEPALIVE = WAKEUP;
export const INIT_LONG = Uint8Array.from([
  0x13, 0x60, 0xe0, 0x05, 0x00, 0x00, 0x00, 0x00, 0x90, 0x26, 0xc2, 0x39, 0x09, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00,
]);
export const TEARDOWN = Uint8Array.from([
  0x12, 0x60, 0xe0, 0x05, 0x9d, 0x02, 0x00, 0x00, 0x20, 0x6e, 0x50, 0x01,
]);

/** Short opcodes (byte 4 of 12-byte frames). */
export const Op = {
  HardwareExit: 0x3a,
  PreviewPlay: 0x8e,
  PreviewStop: 0x8f,
  PadAlloc: 0x91,
  ProjectInit: 0x92,
  PadCopySwap: 0x95,
  Truncate: 0x98,
  SelectProject: 0x9a,
  Disconnect: 0x9d,
  PadRefresh: 0x9f,
  Normalize: 0xa3,
  Emphasis: 0xa9,
  PadQuery: 0xab,
  PatternCopy: 0xad,
  PatternMove: 0xae,
  PatternDelete: 0xaf,
  BouncePrepare: 0xb7,
  BounceExecute: 0xb8,
  AudioPrep: 0xfb,
  AudioExec: 0xfc,
  ProjectInfo: 0xfd,
} as const;

export const SysExOp = {
  OpenFile: 0x00,
  CloseFile: 0x03,
  ReadFile: 0x04,
  WriteFile: 0x06,
  SeekFile: 0x07,
  /** open404 names this Stat; PROTOCOL.md documents Delete — blocked either way. */
  DeleteOrStatPath: 0x0a,
  OpenDir: 0x0c,
  CloseDir: 0x0d,
  QueryFile: 0x12,
  GetFileSize: 0x13,
} as const;

export const AUDIO_PREP_EXPORT_TARGET = 0xe8;
export const RFWV_HEADER_LEN = 512;
export const AUDIO_CHUNK_HINT = 20480;

export const BANKS_A_TO_D = ['A', 'B', 'C', 'D'] as const;
export type SpUsbBank = (typeof BANKS_A_TO_D)[number];
