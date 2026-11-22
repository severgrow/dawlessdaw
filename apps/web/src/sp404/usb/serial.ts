/**
 * Chrome Web Serial transport for SP-404MKII CDC-ACM.
 * All writes go through assertReadOnlyAllowed.
 */

import { assertReadOnlyAllowed } from './allowlist';
import {
  DEFAULT_BAUD,
  INIT_LONG,
  KEEPALIVE,
  KEEPALIVE_MS,
  SP404_USB_PRODUCT_ID,
  SP404_USB_VENDOR_ID,
  TEARDOWN,
  WAKEUP,
} from './constants';
import { extractSysExFrames, parseSysExResponse, type SysexAck } from './packets';

export type SpSerialPortInfo = {
  usbVendorId?: number;
  usbProductId?: number;
};

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function isSp404FilterMatch(info: SpSerialPortInfo): boolean {
  return info.usbVendorId === SP404_USB_VENDOR_ID && info.usbProductId === SP404_USB_PRODUCT_ID;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SpUsbSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private txCounter = 0x10000000;
  private closed = true;

  get open(): boolean {
    return !this.closed && this.port != null;
  }

  nextTxId(): number {
    this.txCounter = (this.txCounter + 1) >>> 0;
    return this.txCounter;
  }

  async requestAndOpen(): Promise<SpSerialPortInfo> {
    if (!webSerialSupported()) {
      throw new Error('Web Serial is not available (use Chrome or Edge on https / localhost).');
    }
    const serial = navigator.serial;
    if (!serial) {
      throw new Error('Web Serial is not available (use Chrome or Edge on https / localhost).');
    }
    const port = await serial.requestPort({
      filters: [{ usbVendorId: SP404_USB_VENDOR_ID, usbProductId: SP404_USB_PRODUCT_ID }],
    });
    await port.open({ baudRate: DEFAULT_BAUD, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    this.port = port;
    this.closed = false;
    this.writer = port.writable!.getWriter();
    this.reader = port.readable!.getReader();
    this.buffer = new Uint8Array(0);
    this.readLoop = this.pumpReads();
    await this.handshake();
    return port.getInfo();
  }

  private async handshake(): Promise<void> {
    await this.sendRaw(WAKEUP);
    await sleep(50);
    await this.sendRaw(INIT_LONG);
    await sleep(50);
    this.keepaliveTimer = setInterval(() => {
      void this.sendRaw(KEEPALIVE).catch(() => undefined);
    }, KEEPALIVE_MS);
  }

  private async pumpReads(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.length) this.append(value);
      }
    } catch {
      // port closed
    }
  }

  private append(chunk: Uint8Array): void {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer, 0);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  async sendRaw(frame: Uint8Array): Promise<void> {
    assertReadOnlyAllowed(frame);
    if (!this.writer) throw new Error('SP USB port not open');
    await this.writer.write(frame);
  }

  drain(): void {
    this.buffer = new Uint8Array(0);
  }

  /**
   * Wait until a SysEx response is assembled, or timeout.
   */
  async waitSysEx(timeoutMs: number): Promise<SysexAck> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { frames, rest } = extractSysExFrames(this.buffer);
      this.buffer = new Uint8Array(rest);
      for (const frame of frames) {
        const parsed = parseSysExResponse(frame);
        if (parsed) return parsed;
      }
      await sleep(15);
    }
    throw new Error('timeout waiting for SP SysEx response');
  }

  /**
   * Collect SysEx data chunks until RFWV+PCM complete or timeout idle.
   */
  async collectExportStream(
    _handle: number,
    requestMore: () => Promise<void>,
    onProgress?: (have: number, total: number) => void,
  ): Promise<Uint8Array> {
    const RFWV = 512;
    let raw = new Uint8Array(0);
    let totalRaw = 0;
    let hdrOk = false;
    let last = Date.now();
    const idleLimit = 4000;

    const appendRaw = (chunk: Uint8Array) => {
      const n = new Uint8Array(raw.length + chunk.length);
      n.set(raw, 0);
      n.set(chunk, raw.length);
      raw = n;
    };

    while (Date.now() - last < idleLimit) {
      const { frames, rest } = extractSysExFrames(this.buffer);
      this.buffer = new Uint8Array(rest);
      for (const frame of frames) {
        const parsed = parseSysExResponse(frame);
        if (!parsed?.isData) continue;
        last = Date.now();
        appendRaw(parsed.payload);
        if (!hdrOk && raw.length >= RFWV) {
          // chunkSize at bytes 4..7 BE
          const chunkSize =
            ((raw[4]! << 24) | (raw[5]! << 16) | (raw[6]! << 8) | raw[7]!) >>> 0;
          const pcmBytes = Math.max(0, chunkSize - RFWV + 8);
          totalRaw = RFWV + pcmBytes;
          hdrOk = true;
        }
        if (hdrOk) {
          const have = Math.min(raw.length - RFWV, totalRaw - RFWV);
          onProgress?.(Math.max(0, have), Math.max(0, totalRaw - RFWV));
          if (raw.length >= totalRaw) return raw.subarray(0, totalRaw);
        }
      }
      if (hdrOk && raw.length < totalRaw && Date.now() - last > 350) {
        await requestMore();
        last = Date.now();
      }
      await sleep(20);
    }
    if (!hdrOk) throw new Error('export stream ended before RFWV header');
    if (raw.length < totalRaw) {
      // return what we have — caller may still decode
      return raw;
    }
    return raw.subarray(0, totalRaw);
  }

  async close(): Promise<void> {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    try {
      if (this.writer) await this.sendRaw(TEARDOWN);
    } catch {
      // ignore
    }
    this.closed = true;
    try {
      this.reader?.releaseLock();
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    this.reader = null;
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.port = null;
  }
}
