/**
 * Read-only helpers for listing pads from a mounted SP-404MKII SD card
 * (or an exported/imported project folder on that card).
 *
 * Honest limits:
 * - Stock USB is audio/MIDI only — the live pad library is not a disk.
 * - Pads show up here after EXPORT PROJECT (or an IMPORT/PROJECT_* kit),
 *   not while the card is sitting unused in the SP.
 * - BKUP/*.bin is opaque; we do not parse it.
 * - No Web MIDI / SysEx pad dump.
 */

import { PADS_PER_BANK, SP_BANKS, padKey, type SpBank } from './samplePrep';

export const RFWV_HEADER_LEN = 512;
const PADCONF_MAGIC = 'RFPD';
const PAD_COUNT = SP_BANKS.length * PADS_PER_BANK; // 160
const NAME_LEN = 24;
const RECORD_WORDS = 43;
const RECORD_BYTES = RECORD_WORDS * 4; // 172

/** Layouts from community RE (SparkyMK2 / gsterlin notes), firmware ~5.x. */
const PADCONF_V3 = {
  len: 52_000,
  projectName: 0x80,
  projectNameLen: 32,
  records: 0xa0,
  names: 0x6c20,
} as const;

const PADCONF_V2 = {
  len: 31_488,
  projectName: null as number | null,
  projectNameLen: 0,
  records: 0x80,
  names: 0x6c00,
} as const;

export interface SdPadSlot {
  key: string;
  bank: SpBank;
  pad: number;
  /** True when the project lists a sample on this pad. */
  occupied: boolean;
  /** Pad name from PADCONF (may be empty even when occupied). */
  name: string;
  /** On-disk sample file name when found under SMPL/, e.g. BANK1-01.SMP */
  fileName: string | null;
  /** Duration in seconds from RFWV header when the .SMP was readable. */
  durationSec: number | null;
  channels: number | null;
  sampleRate: number | null;
  /** Byte length of the .SMP file when known. */
  fileBytes: number | null;
}

export interface SdProjectScan {
  /** Folder label, e.g. PROJECT_01 or the path we found. */
  id: string;
  /** Relative path from the granted root to the project folder. */
  path: string;
  projectName: string;
  source: 'export' | 'import' | 'other';
  pads: SdPadSlot[];
  occupiedCount: number;
  /** How we filled the pad map. */
  via: Array<'padconf' | 'smpl'>;
}

export interface RfwvInfo {
  chunkSize: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  /** PCM payload bytes (after the 512-byte header). */
  pcmBytes: number;
  durationSec: number;
}

export interface ListedEntry {
  /** Relative path using `/`, e.g. `EXPORT/PROJECT/PROJECT_01/SMPL/BANK1-01.SMP` */
  path: string;
  /** File size in bytes when known; directories omit this or use null. */
  size?: number | null;
  kind: 'file' | 'directory';
}

/** `BANK1-01.SMP` → bank A, pad 1. Also accepts `BANK-1-01.SMP`. */
export function parseBankSmpFileName(fileName: string): { bank: SpBank; pad: number } | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const m = /^BANK-?(\d{1,2})-(\d{1,2})\.SMP$/i.exec(base.trim());
  if (!m) return null;
  const bankNum = Number(m[1]);
  const pad = Number(m[2]);
  if (bankNum < 1 || bankNum > SP_BANKS.length || pad < 1 || pad > PADS_PER_BANK) return null;
  return { bank: SP_BANKS[bankNum - 1]!, pad };
}

export function bankNumber(bank: SpBank): number {
  return SP_BANKS.indexOf(bank) + 1;
}

export function smpFileName(bank: SpBank, pad: number): string {
  return `BANK${bankNumber(bank)}-${String(pad).padStart(2, '0')}.SMP`;
}

/** Parse the 512-byte RFWV header used by SP-404MKII .SMP files (open404 layout). */
export function parseRfwvHeader(data: ArrayBuffer | Uint8Array): RfwvInfo | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < RFWV_HEADER_LEN) return null;
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'RFWV') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkSize = view.getUint32(4, false);
  const sampleRate = view.getUint32(8, false);
  const channels = view.getUint32(12, false);
  const bitDepth = view.getUint32(16, false);
  if (sampleRate === 0 || channels === 0 || bitDepth === 0) return null;
  // ChunkSize = pcmBytes + 512 - 8 (open404 NewRFWVHeader).
  const pcmBytes = Math.max(0, chunkSize - (RFWV_HEADER_LEN - 8));
  const bytesPerFrame = channels * (bitDepth / 8);
  const durationSec = bytesPerFrame > 0 ? pcmBytes / bytesPerFrame / sampleRate : 0;
  return { chunkSize, sampleRate, channels, bitDepth, pcmBytes, durationSec };
}

function readCString(bytes: Uint8Array, offset: number, maxLen: number): string {
  const slice = bytes.subarray(offset, offset + maxLen);
  let end = slice.length;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) {
      end = i;
      break;
    }
  }
  let out = '';
  for (let i = 0; i < end; i++) {
    const c = slice[i]!;
    if (c >= 0x20 && c <= 0x7e) out += String.fromCharCode(c);
  }
  return out.trim();
}

export interface PadconfPad {
  key: string;
  bank: SpBank;
  pad: number;
  name: string;
  occupied: boolean;
  /** First three BE u32 words of the pad record (start/end related). */
  endByte: number;
  startByte: number;
}

export interface PadconfParse {
  version: 2 | 3;
  projectName: string;
  pads: PadconfPad[];
}

/** Parse PADCONF.BIN (RFPD). Returns null if magic/version/size do not match. */
export function parsePadconf(data: ArrayBuffer | Uint8Array): PadconfParse | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 16) return null;
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== PADCONF_MAGIC) {
    return null;
  }
  const versionByte = bytes[8]!;
  const layout = versionByte === 3 ? PADCONF_V3 : versionByte === 2 ? PADCONF_V2 : null;
  if (!layout || bytes.length < layout.len) return null;

  const projectName =
    layout.projectName != null
      ? readCString(bytes, layout.projectName, layout.projectNameLen)
      : '';

  const pads: PadconfPad[] = [];
  for (let i = 0; i < PAD_COUNT; i++) {
    const bank = SP_BANKS[Math.floor(i / PADS_PER_BANK)]!;
    const pad = (i % PADS_PER_BANK) + 1;
    const rec = layout.records + i * RECORD_BYTES;
    const view = new DataView(bytes.buffer, bytes.byteOffset + rec, RECORD_BYTES);
    const endByte = view.getUint32(0, false);
    const startByte = view.getUint32(4, false);
    const endAlt = view.getUint32(8, false);
    const name = readCString(bytes, layout.names + i * NAME_LEN, NAME_LEN);
    // Occupied pads have a non-zero end marker (community dumps / Sparky tests).
    const occupied = endByte > 0 || endAlt > 0 || startByte > 0;
    pads.push({
      key: padKey(bank, pad),
      bank,
      pad,
      name,
      occupied,
      endByte,
      startByte,
    });
  }

  return { version: versionByte as 2 | 3, projectName, pads };
}

function emptySlots(): SdPadSlot[] {
  const pads: SdPadSlot[] = [];
  for (const bank of SP_BANKS) {
    for (let pad = 1; pad <= PADS_PER_BANK; pad++) {
      pads.push({
        key: padKey(bank, pad),
        bank,
        pad,
        occupied: false,
        name: '',
        fileName: null,
        durationSec: null,
        channels: null,
        sampleRate: null,
        fileBytes: null,
      });
    }
  }
  return pads;
}

/** Normalise path separators and strip a leading `./`. */
export function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

/**
 * Find project roots that look like SP project folders:
 * - `…/EXPORT/PROJECT/PROJECT_01`
 * - `…/EXPORT/PROJECTS/PROJECT_01`
 * - `…/IMPORT/PROJECT_01`
 * - any folder that contains `PADCONF.BIN` and/or `SMPL/`
 */
export function findProjectDirs(entries: ListedEntry[]): string[] {
  const dirs = new Set<string>();
  const files = new Set<string>();
  for (const e of entries) {
    const p = normalisePath(e.path).replace(/\/$/, '');
    if (!p) continue;
    if (e.kind === 'directory') dirs.add(p);
    else files.add(p);
  }

  const projects = new Set<string>();

  for (const f of files) {
    if (/\/PADCONF\.BIN$/i.test(f) || /^PADCONF\.BIN$/i.test(f)) {
      const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
      projects.add(parent);
    }
    if (/\/SMPL\/[^/]+\.SMP$/i.test(f)) {
      const smpl = f.slice(0, f.lastIndexOf('/'));
      const parent = smpl.includes('/') ? smpl.slice(0, smpl.lastIndexOf('/')) : '';
      projects.add(parent);
    }
  }

  for (const d of dirs) {
    if (/\/SMPL$/i.test(d) || /^SMPL$/i.test(d)) {
      const parent = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
      projects.add(parent);
    }
    // Named project folders even before we see files (empty export).
    if (/\/PROJECT(_\d+)?$/i.test(d) && /\/EXPORT\//i.test(d)) {
      // EXPORT/PROJECT itself is a container, not a project.
      if (!/\/EXPORT\/PROJECT$/i.test(d) && !/\/EXPORT\/PROJECTS$/i.test(d)) {
        projects.add(d);
      }
    }
    if (/^IMPORT\/PROJECT/i.test(d) || /\/IMPORT\/PROJECT/i.test(d)) {
      projects.add(d);
    }
  }

  return [...projects].sort((a, b) => a.localeCompare(b));
}

export function projectSourceFromPath(path: string): SdProjectScan['source'] {
  const p = normalisePath(path).toUpperCase();
  if (p.includes('/EXPORT/') || p.startsWith('EXPORT/')) return 'export';
  if (p.includes('/IMPORT/') || p.startsWith('IMPORT/')) return 'import';
  return 'other';
}

export function projectIdFromPath(path: string): string {
  const p = normalisePath(path);
  if (!p) return 'project';
  return p.split('/').pop() || p;
}

/**
 * Build a pad map from PADCONF bytes and optional SMPL file rows.
 * `smplFiles` keys are pad keys; values carry file metadata / RFWV.
 */
export function buildProjectScan(opts: {
  path: string;
  padconf?: PadconfParse | null;
  smplFiles?: Partial<
    Record<
      string,
      {
        fileName: string;
        fileBytes?: number | null;
        rfwv?: RfwvInfo | null;
      }
    >
  >;
}): SdProjectScan {
  const pads = emptySlots();
  const via: SdProjectScan['via'] = [];
  const byKey = Object.fromEntries(pads.map((p) => [p.key, p])) as Record<string, SdPadSlot>;

  if (opts.padconf) {
    via.push('padconf');
    for (const p of opts.padconf.pads) {
      const slot = byKey[p.key]!;
      slot.occupied = p.occupied;
      slot.name = p.name;
    }
  }

  if (opts.smplFiles) {
    via.push('smpl');
    for (const [key, meta] of Object.entries(opts.smplFiles)) {
      if (!meta) continue;
      const slot = byKey[key];
      if (!slot) continue;
      slot.occupied = true;
      slot.fileName = meta.fileName;
      slot.fileBytes = meta.fileBytes ?? null;
      if (meta.rfwv) {
        slot.durationSec = meta.rfwv.durationSec;
        slot.channels = meta.rfwv.channels;
        slot.sampleRate = meta.rfwv.sampleRate;
      }
    }
  }

  const occupiedCount = pads.filter((p) => p.occupied).length;
  const projectName = opts.padconf?.projectName?.trim() || projectIdFromPath(opts.path);

  return {
    id: projectIdFromPath(opts.path),
    path: normalisePath(opts.path),
    projectName,
    source: projectSourceFromPath(opts.path),
    pads,
    occupiedCount,
    via: via.length ? via : ['smpl'],
  };
}

/** Format a short duration label for the UI. */
export function formatPadDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  if (sec < 10) return `${sec.toFixed(2)} s`;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
