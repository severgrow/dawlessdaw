import { describe, expect, it } from 'vitest';
import {
  ALLOWED_SHORT_OPCODES,
  BLOCKED_SHORT_OPCODES,
  BLOCKED_SYSEX_OPCODES,
  ReadOnlyViolation,
  assertReadOnlyAllowed,
  isFirmwareTested,
  isReadOnlyAllowed,
  normalizeFirmware,
} from './allowlist';
import {
  INIT_LONG,
  MAGIC_SYSEX,
  Op,
  SysExOp,
  TEARDOWN,
  WAKEUP,
} from './constants';
import {
  audioExecPacket,
  audioPrepExportPacket,
  padQueryPacket,
  padSelectClearPacket,
  padSelectPacket,
  projectInfoPacket,
  selectProjectPacket,
  shortPacket,
  sysexCloseFile,
  sysexGetFileSize,
  sysexOpenRead,
  sysexReadFile,
} from './packets';

function sysexPacket(txId: number, tag: number[], op: number, extra: number[]): Uint8Array {
  const sysex = Uint8Array.from([0xf0, 0x41, 0x7a, 0x03, op, ...extra, 0xf7]);
  const out = new Uint8Array(16 + sysex.length);
  out.set(MAGIC_SYSEX, 0);
  out.set(tag, 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(8, txId, true);
  dv.setUint32(12, sysex.length, true);
  out.set(sysex, 16);
  return out;
}

describe('SP USB read-only allow-list', () => {
  it('allows session wakeup / init / teardown / keepalive', () => {
    expect(isReadOnlyAllowed(WAKEUP)).toBe(true);
    expect(isReadOnlyAllowed(INIT_LONG)).toBe(true);
    expect(isReadOnlyAllowed(TEARDOWN)).toBe(true);
  });

  it('allows project info, select, pad query, export prep/exec', () => {
    expect(isReadOnlyAllowed(projectInfoPacket(0))).toBe(true);
    expect(isReadOnlyAllowed(selectProjectPacket(0))).toBe(true);
    expect(isReadOnlyAllowed(padQueryPacket(0x00))).toBe(true);
    expect(isReadOnlyAllowed(audioPrepExportPacket())).toBe(true);
    expect(isReadOnlyAllowed(audioExecPacket())).toBe(true);
  });

  it('allows pad select / clear and read-mode SysEx open/read/close/size', () => {
    expect(isReadOnlyAllowed(padSelectClearPacket(1))).toBe(true);
    expect(isReadOnlyAllowed(padSelectPacket(2, 0x00))).toBe(true);
    const path = '/SP404REMOTE///ROLAND\\SP-404MKII\\PROJECT_01/SMPL\\BANK1-01.SMP';
    expect(isReadOnlyAllowed(sysexOpenRead(3, path))).toBe(true);
    expect(isReadOnlyAllowed(sysexReadFile(4, 5))).toBe(true);
    expect(isReadOnlyAllowed(sysexCloseFile(5, 5))).toBe(true);
    expect(isReadOnlyAllowed(sysexGetFileSize(6, 5))).toBe(true);
  });

  it('blocks every known destructive short opcode', () => {
    for (const op of BLOCKED_SHORT_OPCODES) {
      const frame = shortPacket(op, 0x00, [0, 0, 0, 0, 0], 0x05);
      expect(isReadOnlyAllowed(frame), `op 0x${op.toString(16)}`).toBe(false);
      expect(() => assertReadOnlyAllowed(frame)).toThrow(ReadOnlyViolation);
    }
  });

  it('blocks audio prep import (non-export target) and session lock', () => {
    expect(isReadOnlyAllowed(shortPacket(Op.AudioPrep, 0x01, [0, 0, 0, 0, 0], 0x03))).toBe(false);
    expect(isReadOnlyAllowed(shortPacket(Op.Disconnect, 0x7f, [0, 0, 0xff, 0xff, 0xff], 0x01))).toBe(
      false,
    );
  });

  it('blocks SysEx write / delete / open-write flags', () => {
    for (const op of BLOCKED_SYSEX_OPCODES) {
      const frame = sysexPacket(1, [0x66, 0x02, 0x00, 0x00], op, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
      expect(isReadOnlyAllowed(frame), `sysex 0x${op.toString(16)}`).toBe(false);
    }
    // Open with write flags 0c 02
    const path = 'x\0';
    const pathBytes = new TextEncoder().encode(path);
    const sysex = new Uint8Array(4 + 1 + 3 + 2 + 4 + 1 + pathBytes.length + 1);
    let i = 0;
    sysex.set([0xf0, 0x41, 0x7a, 0x03, SysExOp.OpenFile, 0, 0, 0, 0x0c, 0x02, 0, 0, 0, 0], i);
    i = 14;
    sysex[i++] = pathBytes.length;
    sysex.set(pathBytes, i);
    i += pathBytes.length;
    sysex[i] = 0xf7;
    const openWrite = new Uint8Array(16 + sysex.length);
    openWrite.set(MAGIC_SYSEX, 0);
    openWrite.set([0x66, 0x02, 0x00, 0x00], 4);
    new DataView(openWrite.buffer).setUint32(8, 9, true);
    new DataView(openWrite.buffer).setUint32(12, sysex.length, true);
    openWrite.set(sysex, 16);
    expect(isReadOnlyAllowed(openWrite)).toBe(false);
  });

  it('blocks rename / pad-param-set style param frames', () => {
    const rename = new Uint8Array(25);
    rename.set([0x13, 0x60, 0xe0, 0x05, 0x00, 0x00, 0x00, 0x00], 0);
    rename[12] = 0x02; // rename sample subcmd region — still blocked as non-select param
    expect(isReadOnlyAllowed(rename)).toBe(false);

    const padParam = new Uint8Array(25);
    padParam.set([0x13, 0x60, 0xe0, 0x05, 0xf7, 0x7f, 0x00, 0x00], 0);
    expect(isReadOnlyAllowed(padParam)).toBe(false);
  });

  it('allowed short opcodes stay disjoint from blocked', () => {
    const blocked = new Set(BLOCKED_SHORT_OPCODES);
    for (const op of ALLOWED_SHORT_OPCODES) {
      if (op === Op.Disconnect || op === Op.AudioPrep) continue; // gated by target
      expect(blocked.has(op)).toBe(false);
    }
  });

  it('normalizes firmware and gates 5.51', () => {
    expect(normalizeFirmware(' v5.51 ')).toBe('5.51');
    expect(isFirmwareTested('5.51')).toBe(true);
    expect(isFirmwareTested('5.52')).toBe(false);
    expect(isFirmwareTested('v5.51')).toBe(true);
  });

  it('Phase 3: write/erase short ops stay blocked (PatternDelete, PadAlloc, …)', () => {
    for (const op of [
      Op.PatternDelete,
      Op.PadAlloc,
      Op.ProjectInit,
      Op.Truncate,
      Op.Normalize,
      Op.BounceExecute,
    ]) {
      const frame = shortPacket(op, 0x00, [0, 0, 0, 0, 0], 0x05);
      expect(() => assertReadOnlyAllowed(frame)).toThrow(ReadOnlyViolation);
    }
  });
});
