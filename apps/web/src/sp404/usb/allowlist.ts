/**
 * READ-ONLY allow-list for SP-404MKII CDC commands.
 * Every outbound frame must pass assertReadOnlyAllowed before write.
 */

import {
  AUDIO_PREP_EXPORT_TARGET,
  INIT_LONG,
  MAGIC_PARAM,
  MAGIC_SHORT,
  MAGIC_SYSEX,
  OPEN404_TESTED_FIRMWARES,
  Op,
  SysExOp,
  TEARDOWN,
  WAKEUP,
} from './constants';

export type ShortIntent =
  | 'session-wakeup'
  | 'session-teardown'
  | 'select-project'
  | 'project-info'
  | 'pad-query'
  | 'audio-prep-export'
  | 'audio-exec'
  | 'blocked';

export type SysexIntent = 'open-read' | 'read' | 'close' | 'get-size' | 'blocked';

/** Known destructive / mutate short opcodes — must never leave the UI path. */
export const BLOCKED_SHORT_OPCODES: readonly number[] = [
  Op.PadAlloc,
  Op.ProjectInit,
  Op.PadCopySwap,
  Op.Truncate,
  Op.Normalize,
  Op.Emphasis,
  Op.PadRefresh,
  Op.PatternCopy,
  Op.PatternMove,
  Op.PatternDelete,
  Op.BouncePrepare,
  Op.BounceExecute,
  Op.PreviewPlay,
  Op.PreviewStop,
  Op.HardwareExit,
];

/** SysEx opcodes that write, erase, or open directories for mutation. */
export const BLOCKED_SYSEX_OPCODES: readonly number[] = [
  SysExOp.WriteFile,
  SysExOp.DeleteOrStatPath,
  SysExOp.OpenDir,
  SysExOp.CloseDir,
  SysExOp.SeekFile,
  SysExOp.QueryFile,
];

export const ALLOWED_SHORT_OPCODES: readonly number[] = [
  Op.SelectProject,
  Op.ProjectInfo,
  Op.PadQuery,
  Op.AudioPrep,
  Op.AudioExec,
  Op.Disconnect, // only teardown target 0x02 — lock target 0x7f blocked separately
];

export class ReadOnlyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyViolation';
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array | readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function classifyShort(frame: Uint8Array): ShortIntent {
  if (bytesEqual(frame, WAKEUP)) return 'session-wakeup';
  if (bytesEqual(frame, TEARDOWN)) return 'session-teardown';
  if (frame.length !== 12) return 'blocked';
  if (!bytesEqual(frame.subarray(0, 4), MAGIC_SHORT)) return 'blocked';

  const opcode = frame[4]!;
  const target = frame[5]!;

  if (opcode === Op.Disconnect && target === 0x02) return 'session-teardown';
  if (opcode === Op.Disconnect && target === 0x7f) return 'blocked'; // pad session lock
  if (opcode === Op.SelectProject) return 'select-project';
  if (opcode === Op.ProjectInfo) return 'project-info';
  if (opcode === Op.PadQuery) return 'pad-query';
  if (opcode === Op.AudioExec) return 'audio-exec';
  if (opcode === Op.AudioPrep) {
    return target === AUDIO_PREP_EXPORT_TARGET ? 'audio-prep-export' : 'blocked';
  }
  return 'blocked';
}

function classifySysex(frame: Uint8Array): SysexIntent {
  if (frame.length < 20) return 'blocked';
  if (!bytesEqual(frame.subarray(0, 4), MAGIC_SYSEX)) return 'blocked';
  // Payload starts at 16: F0 41 7A 03 [op] ...
  if (frame[16] !== 0xf0 || frame[17] !== 0x41 || frame[18] !== 0x7a || frame[19] !== 0x03) {
    return 'blocked';
  }
  const op = frame[20]!;
  if (op === SysExOp.ReadFile) return 'read';
  if (op === SysExOp.CloseFile) return 'close';
  if (op === SysExOp.GetFileSize) return 'get-size';
  if (op === SysExOp.OpenFile) {
    // flags at bytes 24–25 after header+op+3 zeros
    const f0 = frame[24];
    const f1 = frame[25];
    if (f0 === 0x00 && f1 === 0x00) return 'open-read';
    return 'blocked'; // write flags 0c 02
  }
  return 'blocked';
}

function isSessionInitLong(frame: Uint8Array): boolean {
  // Exact INIT_LONG only — TargetModMemory (00 00 00 00) is also used for rename/sample
  // mutate packets; those must stay blocked.
  return bytesEqual(frame, INIT_LONG);
}

function isPadSelect(frame: Uint8Array): boolean {
  // TargetModPadSelect f8 7f 00 00 — select / clear only (read UI context)
  return (
    frame.length === 25 &&
    bytesEqual(frame.subarray(0, 4), MAGIC_PARAM) &&
    frame[4] === 0xf8 &&
    frame[5] === 0x7f &&
    frame[6] === 0x00 &&
    frame[7] === 0x00
  );
}

/** Returns true if this exact outbound frame is allowed on the read-only path. */
export function isReadOnlyAllowed(frame: Uint8Array): boolean {
  if (frame.length < 4) return false;
  if (bytesEqual(frame, WAKEUP) || bytesEqual(frame, TEARDOWN)) return true;
  if (isSessionInitLong(frame) || isPadSelect(frame)) return true;

  const magic0 = frame[0];
  if (magic0 === MAGIC_SHORT[0] && frame[1] === MAGIC_SHORT[1]) {
    return classifyShort(frame) !== 'blocked';
  }
  if (magic0 === MAGIC_SYSEX[0] && frame[1] === MAGIC_SYSEX[1] && frame[3] === MAGIC_SYSEX[3]) {
    return classifySysex(frame) !== 'blocked';
  }
  // Any other param / metadata / rename / pad-param-set / settings write → blocked
  if (magic0 === MAGIC_PARAM[0] && frame[1] === MAGIC_PARAM[1]) {
    return false;
  }
  return false;
}

/** Throws ReadOnlyViolation if the frame is not allow-listed. */
export function assertReadOnlyAllowed(frame: Uint8Array): void {
  if (!isReadOnlyAllowed(frame)) {
    const head = [...frame.subarray(0, Math.min(12, frame.length))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    throw new ReadOnlyViolation(`Blocked non-read SP USB command: ${head}…`);
  }
}

/** Normalize user-entered firmware (e.g. "v5.51", "5.51 ") → "5.51". */
export function normalizeFirmware(raw: string): string {
  return raw.trim().replace(/^v/i, '').replace(/\s+/g, '');
}

export function isFirmwareTested(raw: string): boolean {
  const n = normalizeFirmware(raw);
  return (OPEN404_TESTED_FIRMWARES as readonly string[]).includes(n);
}
