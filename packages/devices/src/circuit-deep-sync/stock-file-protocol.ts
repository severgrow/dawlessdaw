/**
 * Stock Circuit Rhythm USB file protocol helpers (Components-style).
 *
 * Reverse-mapped from Circuit Remix `Device` in `tools/rm_app.html`:
 *   F0 00 20 29 01 63 03 CMD …
 *
 * READ-ONLY surface for Dawlessdaw Bench:
 * - Universal Identity Request
 * - Optional Remix/Hacks custom-firmware marker query (returns null on stock)
 * - Optional status (loaded pack + channel map) without file session
 * - Optional file-session open + read of a saved session — STATE-CHANGING
 *   (Remix: transport stops / panel locked). Never write / delete / rename /
 *   firmware transfer.
 *
 * Official Programmer’s Reference Guide v5 documents zero SysEx pattern dumps.
 */

import type { CustomFirmwareMarker, DeepSyncIdentity, ProtocolLogEntry } from './types';

export const NOVATION_RHYTHM_PREFIX = [0xf0, 0x00, 0x20, 0x29, 0x01, 0x63] as const;
export const FILE_PROTO_TAG = 0x03;
export const CHUNK = 0x2000;

/** Commands this bench may emit (read / session lifecycle only). */
export const ALLOWED_FILE_CMDS = new Set([
  0x01, // transfer header / read start
  0x0a, // size
  0x0b, // list / probe
  0x0d, // crc
  0x40, // open session — STATE CHANGING
  0x41, // close session
]);

/** Explicitly forbidden — never construct these here. */
export const FORBIDDEN_FILE_CMDS = new Set([
  0x02, // data write packet (outbound write stream)
  0x07, // rename
  0x08, // delete
]);

export type SendFn = (bytes: Uint8Array) => void;

export interface MidiRx {
  data: Uint8Array;
  at: number;
}

function n32(v: number): number[] {
  return [28, 24, 20, 16, 12, 8, 4, 0].map((s) => (v >>> s) & 15);
}

function un32(b: Uint8Array, o: number): number {
  let v = 0;
  for (let i = 0; i < 8; i++) v = v * 16 + (b[o + i]! & 15);
  return v;
}

function enc7(d: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 7) {
    const n = Math.min(7, d.length - i);
    let m = 0;
    for (let k = 0; k < n; k++) m |= (d[i + k]! >> 7) << k;
    out.push(m);
    for (let k = 0; k < n; k++) out.push(d[i + k]! & 0x7f);
  }
  return out;
}

function dec7(e: Uint8Array): Uint8Array {
  const out = new Uint8Array(e.length);
  let o = 0;
  for (let i = 0; i < e.length; i += 8) {
    const m = e[i]!;
    const n = Math.min(7, e.length - i - 1);
    for (let k = 0; k < n; k++) out[o++] = e[i + 1 + k]! | (((m >> k) & 1) << 7);
  }
  return out.subarray(0, o);
}

const CRCT = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRCT[(c ^ d[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isFile(m: Uint8Array): boolean {
  return (
    m.length >= 8 &&
    m[0] === 0xf0 &&
    m[1] === 0x00 &&
    m[2] === 0x20 &&
    m[3] === 0x29 &&
    m[4] === 0x01 &&
    m[5] === 0x63 &&
    m[6] === FILE_PROTO_TAG
  );
}

export function buildIdentityRequest(): Uint8Array {
  return Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7);
}

/** Non-commercial custom marker used by Remix/Hacks (`fwQuery`). Null reply = stock/unknown. */
export function buildCustomFirmwareQuery(): Uint8Array {
  return Uint8Array.of(0xf0, 0x7d, 0x43, 0x54, 0x00, 0x23, 0, 0, 0, 0, 0, 0, 0, 0xf7);
}

export function buildFileCommand(cmd: number, payload: number[] = []): Uint8Array {
  if (FORBIDDEN_FILE_CMDS.has(cmd)) {
    throw new Error(`Forbidden file-protocol command 0x${cmd.toString(16)}`);
  }
  if (!ALLOWED_FILE_CMDS.has(cmd)) {
    throw new Error(`File-protocol command 0x${cmd.toString(16)} is not on the read-only allowlist`);
  }
  // Write direction on cmd 1 sits after 8 offset nibbles + T/P/I (Remix Device.read/write).
  if (cmd === 0x01 && payload.length >= 12) {
    const direction = payload[11];
    if (direction === 1) throw new Error('Write transfers are forbidden in Circuit Deep Sync');
  }
  return Uint8Array.from([...NOVATION_RHYTHM_PREFIX, FILE_PROTO_TAG, cmd, ...payload, 0xf7]);
}

export function parseIdentityReply(m: Uint8Array): DeepSyncIdentity | null {
  if (m.length < 15 || m[0] !== 0xf0 || m[1] !== 0x7e || m[3] !== 0x06 || m[4] !== 0x02) return null;
  const manufacturerId = [m[5]!, m[6]!, m[7]!];
  const family = m[8]!;
  const model = m[9]!;
  const versionNibbles = Array.from(m.subarray(10, Math.min(m.length - 1, 14)));
  const isRhythm = manufacturerId[0] === 0 && manufacturerId[1] === 0x20 && manufacturerId[2] === 0x29 && family === 1 && model === 0x63;
  return {
    manufacturerId,
    family,
    model,
    versionNibbles,
    raw: Array.from(m),
    summary: isRhythm
      ? `Novation Circuit Rhythm identity (family=${family} model=0x${model.toString(16)})`
      : `Non-Rhythm identity (manu=${manufacturerId.map((x) => x.toString(16)).join('.')} family=${family} model=0x${model.toString(16)})`,
  };
}

export function parseCustomFirmwareReply(m: Uint8Array): CustomFirmwareMarker {
  if (
    m.length >= 14 &&
    m[1] === 0x7d &&
    m[2] === 0x43 &&
    m[3] === 0x54 &&
    m[4] === 0x40 &&
    m[5] === 0x23
  ) {
    if (m[6] !== 1) {
      return { present: false, marker: null, raw: Array.from(m), lane: 'custom-firmware-protocol' };
    }
    const marker = String.fromCharCode(
      ...[...m.subarray(7, 13)].filter((c) => c >= 0x20 && c < 0x7f),
    ).trim();
    return {
      present: true,
      marker: marker || null,
      raw: Array.from(m),
      lane: 'custom-firmware-protocol',
    };
  }
  return { present: false, marker: null, raw: null, lane: 'custom-firmware-protocol' };
}

/**
 * Isolated, single-port SysEx conversation. Not wired to production routing.
 */
export class StockFileProtocolClient {
  private q: Uint8Array[] = [];
  private wake: (() => void) | null = null;
  private sess = false;
  private log: ProtocolLogEntry[] = [];

  constructor(
    private send: SendFn,
    private opts: { timeoutScale?: number } = {},
  ) {}

  get protocolLog(): ProtocolLogEntry[] {
    return [...this.log];
  }

  get sessionOpen(): boolean {
    return this.sess;
  }

  pushRx(data: Uint8Array): void {
    this.q.push(data);
    this.log.push({
      at: Date.now(),
      direction: 'rx',
      lane: data[0] === 0xf0 ? 'stock-file-protocol' : 'stock-performance-midi',
      summary: summarizeBytes(data),
      data: Array.from(data),
    });
    if (this.wake) {
      const w = this.wake;
      this.wake = null;
      w();
    }
  }

  private note(direction: ProtocolLogEntry['direction'], summary: string, data?: number[], lane: ProtocolLogEntry['lane'] = 'stock-file-protocol') {
    this.log.push({ at: Date.now(), direction, lane, summary, data });
  }

  private tx(bytes: Uint8Array, summary: string): void {
    this.note('tx', summary, Array.from(bytes));
    this.send(bytes);
  }

  private async next(test: (m: Uint8Array) => boolean, ms: number): Promise<Uint8Array> {
    const end = Date.now() + ms * (this.opts.timeoutScale ?? 1);
    for (;;) {
      while (this.q.length) {
        const m = this.q.shift()!;
        if (test(m)) return m;
      }
      const left = end - Date.now();
      if (left <= 0) throw new Error('device-timeout');
      await new Promise<void>((res) => {
        const t = setTimeout(() => {
          this.wake = null;
          res();
        }, left);
        this.wake = () => {
          clearTimeout(t);
          res();
        };
      });
    }
  }

  async identify(): Promise<DeepSyncIdentity> {
    this.q.length = 0;
    this.tx(buildIdentityRequest(), 'Universal Identity Request');
    const m = await this.next((x) => x[1] === 0x7e && x[3] === 6 && x[4] === 2, 2000);
    const id = parseIdentityReply(m);
    if (!id) throw new Error('identity-parse-failed');
    this.note('info', id.summary, id.raw, 'stock-performance-midi');
    return id;
  }

  async queryCustomFirmware(): Promise<CustomFirmwareMarker> {
    this.q.length = 0;
    this.tx(buildCustomFirmwareQuery(), 'Custom firmware marker query (Remix/Hacks style)');
    const r = await this.next(
      (x) =>
        x.length >= 14 &&
        x[1] === 0x7d &&
        x[2] === 0x43 &&
        x[3] === 0x54 &&
        x[4] === 0x40 &&
        x[5] === 0x23,
      800,
    ).catch(() => null);
    const marker = r ? parseCustomFirmwareReply(r) : { present: false, marker: null, raw: null, lane: 'custom-firmware-protocol' as const };
    this.note(
      'info',
      marker.present ? `Custom FW marker: ${marker.marker}` : 'No custom FW marker (stock or silent)',
      marker.raw ?? undefined,
      'custom-firmware-protocol',
    );
    return marker;
  }

  /** Loaded pack + 8 track channels — Remix `identify` follow-up (`… 49 F7`). No file session. */
  async queryLoadedStatus(): Promise<{ loaded: number | null; channels: number[] | null }> {
    this.q.length = 0;
    const bytes = Uint8Array.from([...NOVATION_RHYTHM_PREFIX, 0x49, 0xf7]);
    this.tx(bytes, 'Device status query (loaded pack / channels)');
    const s = await this.next((x) => x[6] === 9 && x.length >= 20, 1000).catch(() => null);
    if (!s) {
      this.note('warn', 'No status reply (documented-unverified on some firmwares)');
      return { loaded: null, channels: null };
    }
    const loaded = s[s.length - 2] ?? null;
    const channels = [...s.subarray(7, 15)];
    this.note('info', `Loaded pack index=${loaded}; channels=[${channels.join(',')}]`, Array.from(s));
    return { loaded, channels };
  }

  /**
   * Opens Components-style file session. STATE-CHANGING: stops transport / locks panel (Remix).
   * Caller must have user confirmation.
   */
  async openSession(confirmed: boolean): Promise<'opened' | 'adopted'> {
    if (!confirmed) throw new Error('Session open requires explicit user confirmation');
    this.q.length = 0;
    this.tx(buildFileCommand(0x0b, [1]), 'Probe existing file session');
    const m = await this.next((x) => isFile(x) && (x[7] === 0x0b || x[7] === 4 || x[7] === 5), 1000).catch(
      () => null,
    );
    if (m) {
      this.sess = true;
      this.note('warn', 'Adopted already-open file session — transport likely already stopped');
      return 'adopted';
    }
    this.tx(buildFileCommand(0x40, [0]), 'Open file session (STOPS PLAYBACK)');
    const s = await this.next((x) => isFile(x) && (x[7] === 4 || x[7] === 5), 60000);
    if (s[7] !== 4) throw new Error(`device-status-${s[19] ?? '?'}`);
    this.sess = true;
    this.note('warn', 'File session opened — Remix: transport stopped, panel locked until close');
    return 'opened';
  }

  async closeSession(): Promise<void> {
    if (!this.sess) return;
    this.sess = false;
    this.tx(buildFileCommand(0x41, [0]), 'Close file session');
    await this.next((x) => isFile(x) && (x[7] === 4 || x[7] === 5), 60000);
    this.note('info', 'File session closed');
  }

  /** Read a file from device storage (Sessions type=3). Requires open session. */
  async readFile(type: number, pack: number, index: number): Promise<Uint8Array> {
    if (!this.sess) throw new Error('file session not open');
    this.q.length = 0;
    // Read start: cmd 1, offset 0, T/P/I, direction=2 (read), size 0
    this.tx(
      buildFileCommand(0x01, [...n32(0), type, pack, index, 2, ...n32(0)]),
      `Read start T=${type} P=${pack} I=${index}`,
    );
    const h = await this.next((x) => isFile(x) && (x[7] === 1 || x[7] === 5 || x[7] === 6), 10000);
    if (h[7] === 6) throw new Error('device-file-missing');
    if (h[7] === 5) throw new Error(`device-status-${h[19]}`);
    const size = un32(h, 20);
    const out = new Uint8Array(size);
    for (let o = 0; ; ) {
      const m = await this.next((x) => isFile(x) && (x[7] === 2 || x[7] === 3), 5000);
      if (m[7] === 2) {
        const d = dec7(m.subarray(19, m.length - 1));
        if (o + d.length > size) throw new Error('device-read-overflow');
        out.set(d, o);
        o += d.length;
        continue;
      }
      if (o !== size || un32(m, 19) !== crc32(out)) throw new Error('device-read-crc');
      this.note('info', `Read ${size} bytes OK (saved storage — not live RAM)`);
      return out;
    }
  }
}

export function summarizeBytes(data: Uint8Array): string {
  if (!data.length) return '(empty)';
  const hex = Array.from(data.slice(0, 24))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  const more = data.length > 24 ? ` …(+${data.length - 24})` : '';
  if (data[0] === 0xf0) return `SysEx len=${data.length} ${hex}${more}`;
  const st = data[0]!;
  if (st === 0xf8) return 'Clock';
  if (st === 0xfa) return 'Start';
  if (st === 0xfb) return 'Continue';
  if (st === 0xfc) return 'Stop';
  const ch = (st & 0x0f) + 1;
  const t = st & 0xf0;
  if (t === 0x90) return `NoteOn ch${ch} n${data[1]} v${data[2]}`;
  if (t === 0x80) return `NoteOff ch${ch} n${data[1]}`;
  if (t === 0xb0) return `CC ch${ch} ${data[1]}=${data[2]}`;
  if (t === 0xc0) return `PGM ch${ch} ${data[1]}`;
  return `MIDI ${hex}${more}`;
}

/** Exported for unit tests of encode helpers (no device I/O). */
export const _test = { n32, un32, enc7, dec7, crc32, isFile, CHUNK };
