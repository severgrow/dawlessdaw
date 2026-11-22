/** Build READ-ONLY SP-404MKII CDC frames (open404-compatible). */

import {
  AUDIO_PREP_EXPORT_TARGET,
  MAGIC_PARAM,
  MAGIC_SHORT,
  MAGIC_SYSEX,
  Op,
  SysExOp,
} from './constants';

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  const v = n >>> 0;
  b[0] = v & 0xff;
  b[1] = (v >>> 8) & 0xff;
  b[2] = (v >>> 16) & 0xff;
  b[3] = (v >>> 24) & 0xff;
  return b;
}

export function padId(bank: string, pad: number): number {
  const b = bank.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  if (b < 0 || b > 9) throw new Error(`invalid bank ${bank}`);
  if (pad < 1 || pad > 16) throw new Error(`invalid pad ${pad}`);
  return (b << 4) | (pad - 1);
}

export function formatSamplePath(projectNum: number, bank: string, pad: number): string {
  const bankNum = bank.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  const nn = String(projectNum).padStart(2, '0');
  const pp = String(pad).padStart(2, '0');
  return `/SP404REMOTE///ROLAND\\SP-404MKII\\PROJECT_${nn}/SMPL\\BANK${bankNum}-${pp}.SMP`;
}

export function shortPacket(
  opcode: number,
  target: number,
  params: readonly number[] = [0, 0, 0, 0, 0],
  tail = 0x03,
): Uint8Array {
  const out = new Uint8Array(12);
  out.set(MAGIC_SHORT, 0);
  out[4] = opcode;
  out[5] = target;
  for (let i = 0; i < 5; i++) out[6 + i] = params[i] ?? 0;
  out[11] = tail;
  return out;
}

export function projectInfoPacket(projectId0: number): Uint8Array {
  return shortPacket(Op.ProjectInfo, projectId0, [0, 0, 0, 0, 0], 0x03);
}

export function selectProjectPacket(projectId0: number): Uint8Array {
  return shortPacket(Op.SelectProject, projectId0, [0, 0, 0, 0, 0], 0x03);
}

export function padQueryPacket(id: number): Uint8Array {
  return shortPacket(Op.PadQuery, id, [0, 0, 0, 0, 0], 0x05);
}

export function audioPrepExportPacket(): Uint8Array {
  return shortPacket(Op.AudioPrep, AUDIO_PREP_EXPORT_TARGET, [0x03, 0, 0, 0, 0], 0x03);
}

export function audioExecPacket(): Uint8Array {
  return shortPacket(Op.AudioExec, 0x00, [0, 0, 0, 0, 0], 0x03);
}

export function padSelectPacket(txId: number, id: number): Uint8Array {
  const out = new Uint8Array(25);
  out.set(MAGIC_PARAM, 0);
  out[4] = 0xf8;
  out[5] = 0x7f;
  out[6] = 0x00;
  out[7] = 0x00;
  out.set(u32le(txId), 8);
  out.set([0x09, 0x00, 0x00, 0x00, 0x01], 12);
  out.set([0x01, 0x00, 0xff, 0xff], 17);
  out[21] = id;
  return out;
}

export function padSelectClearPacket(txId: number): Uint8Array {
  const out = new Uint8Array(25);
  out.set(MAGIC_PARAM, 0);
  out[4] = 0xf8;
  out[5] = 0x7f;
  out[6] = 0x00;
  out[7] = 0x00;
  out.set(u32le(txId), 8);
  out.set([0x09, 0x00, 0x00, 0x00, 0x01], 12);
  out.set([0x00, 0x00, 0xff, 0xff], 17);
  return out;
}

function buildSysExFilePacket(txId: number, tag: readonly number[], sysex: Uint8Array): Uint8Array {
  const out = new Uint8Array(16 + sysex.length);
  out.set(MAGIC_SYSEX, 0);
  out.set(tag, 4);
  out.set(u32le(txId), 8);
  out.set(u32le(sysex.length), 12);
  out.set(sysex, 16);
  return out;
}

/** Open sample path in READ mode only (flags 00 00). */
export function sysexOpenRead(txId: number, path: string): Uint8Array {
  const pathBytes = new TextEncoder().encode(path.endsWith('\0') ? path : `${path}\0`);
  const sysex = new Uint8Array(4 + 1 + 3 + 2 + 4 + 1 + pathBytes.length + 1);
  let i = 0;
  sysex.set([0xf0, 0x41, 0x7a, 0x03], i);
  i += 4;
  sysex[i++] = SysExOp.OpenFile;
  sysex[i++] = 0;
  sysex[i++] = 0;
  sysex[i++] = 0;
  sysex[i++] = 0x00; // read
  sysex[i++] = 0x00;
  sysex[i++] = 0;
  sysex[i++] = 0;
  sysex[i++] = 0;
  sysex[i++] = 0;
  sysex[i++] = pathBytes.length;
  sysex.set(pathBytes, i);
  i += pathBytes.length;
  sysex[i] = 0xf7;
  return buildSysExFilePacket(txId, [0x9e, 0x01, 0x00, 0x00], sysex);
}

export function sysexReadFile(txId: number, handle: number): Uint8Array {
  const sysex = Uint8Array.from([
    0xf0, 0x41, 0x7a, 0x03, SysExOp.ReadFile, 0, 0, 0, 0, handle, 0x20, 0x00, 0x14, 0x00, 0x00, 0x00, 0xf7,
  ]);
  return buildSysExFilePacket(txId, [0, 0, 0, 0], sysex);
}

export function sysexCloseFile(txId: number, handle: number): Uint8Array {
  const sysex = Uint8Array.from([
    0xf0, 0x41, 0x7a, 0x03, SysExOp.CloseFile, 0, 0, 0, 0, handle, 0, 0, 0, 0, 0, 0, 0xf7,
  ]);
  return buildSysExFilePacket(txId, [0x9e, 0x01, 0x00, 0x00], sysex);
}

export function sysexGetFileSize(txId: number, handle: number): Uint8Array {
  const sysex = Uint8Array.from([
    0xf0, 0x41, 0x7a, 0x03, SysExOp.GetFileSize, 0, 0, 0, 0, handle, 0, 0, 0, 0, 0, 0, 0xf7,
  ]);
  return buildSysExFilePacket(txId, [0, 0, 0, 0], sysex);
}

export type SysexAck = {
  isAck: boolean;
  isData: boolean;
  handle: number;
  status: number;
  payload: Uint8Array;
};

/** Parse a device SysEx response frame (magic 13 e0 60 06 …). */
export function parseSysExResponse(data: Uint8Array): SysexAck | null {
  if (data.length < 16) return null;
  let idx = -1;
  for (let i = 0; i < data.length - 2; i++) {
    if (data[i] === 0xf0 && data[i + 1] === 0x41 && data[i + 2] === 0x7a) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const sysex = data.subarray(idx);
  if (sysex.length < 6) return null;
  const respType = sysex[3]!;

  if (respType === 0x7a) {
    if (sysex.length < 15) return null;
    const handle = sysex[8]!;
    const status = sysex[13]!;
    const ok = status === 0x00 || status === 0x02 || status === 0x08;
    return {
      isAck: ok,
      isData: false,
      handle: ok ? handle : 0,
      status,
      payload: new Uint8Array(0),
    };
  }

  if (respType === 0x02) {
    const handle = sysex.length > 8 ? sysex[8]! : 0;
    let end = sysex.length;
    if (end > 14 && sysex[end - 1] === 0xf7) end -= 1;
    const payload = end > 14 ? sysex.subarray(14, end) : new Uint8Array(0);
    return { isAck: false, isData: true, handle, status: 0, payload: new Uint8Array(payload) };
  }

  return null;
}

/** Find complete SysEx serial packets in a byte stream. */
export function extractSysExFrames(stream: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset + 16 <= stream.length) {
    let idx = -1;
    for (let i = offset; i + 4 <= stream.length; i++) {
      if (
        stream[i] === MAGIC_SYSEX_RESP_0 &&
        stream[i + 1] === MAGIC_SYSEX_RESP_1 &&
        stream[i + 2] === MAGIC_SYSEX_RESP_2 &&
        stream[i + 3] === MAGIC_SYSEX_RESP_3
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      const keep = Math.min(3, stream.length - offset);
      return { frames, rest: stream.subarray(stream.length - keep) };
    }
    if (idx + 16 > stream.length) {
      return { frames, rest: stream.subarray(idx) };
    }
    const payloadLen =
      stream[idx + 12]! |
      (stream[idx + 13]! << 8) |
      (stream[idx + 14]! << 16) |
      (stream[idx + 15]! << 24);
    const total = 16 + payloadLen;
    if (idx + total > stream.length) {
      return { frames, rest: stream.subarray(idx) };
    }
    frames.push(stream.subarray(idx, idx + total));
    offset = idx + total;
  }
  return { frames, rest: stream.subarray(offset) };
}

const MAGIC_SYSEX_RESP_0 = 0x13;
const MAGIC_SYSEX_RESP_1 = 0xe0;
const MAGIC_SYSEX_RESP_2 = 0x60;
const MAGIC_SYSEX_RESP_3 = 0x06;
