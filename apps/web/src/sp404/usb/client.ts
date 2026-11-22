/**
 * Read-only SP-404MKII USB client (Web Serial).
 * List projects/pads and export one pad as WAV — no write/erase path.
 */

import { BANKS_A_TO_D, type SpUsbBank } from './constants';
import {
  audioExecPacket,
  audioPrepExportPacket,
  formatSamplePath,
  padId,
  padQueryPacket,
  padSelectClearPacket,
  padSelectPacket,
  projectInfoPacket,
  selectProjectPacket,
  sysexCloseFile,
  sysexOpenRead,
  sysexReadFile,
} from './packets';
import { rfwvStreamToWav, type RfwvHeader } from './rfwv';
import { SpUsbSerial, type SpSerialPortInfo, webSerialSupported } from './serial';

export { webSerialSupported };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type UsbPadSlot = {
  bank: SpUsbBank;
  pad: number;
  key: string;
  occupied: boolean;
  error?: string;
};

export type UsbExportResult = {
  key: string;
  wav: Uint8Array;
  header: RfwvHeader;
  fileName: string;
};

export class SpUsbReadOnlyClient {
  private serial = new SpUsbSerial();
  private activeProject = 0;
  portInfo: SpSerialPortInfo | null = null;

  get connected(): boolean {
    return this.serial.open;
  }

  async connect(): Promise<SpSerialPortInfo> {
    this.portInfo = await this.serial.requestAndOpen();
    return this.portInfo;
  }

  async disconnect(): Promise<void> {
    await this.serial.close();
    this.portInfo = null;
    this.activeProject = 0;
  }

  /** Probe projects 1–16 with Project Info (best-effort; names may be opaque). */
  async listProjects(): Promise<{ project: number; ok: boolean }[]> {
    const out: { project: number; ok: boolean }[] = [];
    for (let p = 1; p <= 16; p++) {
      try {
        await this.serial.sendRaw(projectInfoPacket(p - 1));
        await sleep(30);
        out.push({ project: p, ok: true });
      } catch (err) {
        out.push({ project: p, ok: false });
        if (err instanceof Error && err.name === 'ReadOnlyViolation') throw err;
      }
    }
    return out;
  }

  async selectProject(projectNum: number): Promise<void> {
    if (projectNum < 1 || projectNum > 16) throw new Error('project must be 1–16');
    await this.serial.sendRaw(selectProjectPacket(projectNum - 1));
    this.activeProject = projectNum;
    await sleep(750);
    this.serial.drain();
  }

  /**
   * List pads for banks A–D by attempting a read-mode Open on each .SMP.
   * Empty pads NACK / handle 0; occupied pads get Open ACK then Close.
   */
  async listPadsBanksAD(
    projectNum: number,
    onProgress?: (done: number, total: number, key: string) => void,
  ): Promise<UsbPadSlot[]> {
    if (this.activeProject !== projectNum) {
      await this.selectProject(projectNum);
    }
    const slots: UsbPadSlot[] = [];
    const total = BANKS_A_TO_D.length * 16;
    let done = 0;
    for (const bank of BANKS_A_TO_D) {
      for (let pad = 1; pad <= 16; pad++) {
        const key = `${bank}${String(pad).padStart(2, '0')}`;
        onProgress?.(done, total, key);
        const slot = await this.probePad(projectNum, bank, pad);
        slots.push(slot);
        done += 1;
        onProgress?.(done, total, key);
      }
    }
    return slots;
  }

  private async probePad(projectNum: number, bank: SpUsbBank, pad: number): Promise<UsbPadSlot> {
    const key = `${bank}${String(pad).padStart(2, '0')}`;
    this.serial.drain();
    try {
      await this.serial.sendRaw(audioPrepExportPacket());
      await sleep(20);
      const path = formatSamplePath(projectNum, bank, pad);
      await this.serial.sendRaw(sysexOpenRead(this.serial.nextTxId(), path));
      const resp = await this.serial.waitSysEx(900);
      const occupied = Boolean(resp.isAck && resp.handle && resp.handle !== 0x7f);
      if (occupied) {
        await this.serial.sendRaw(sysexCloseFile(this.serial.nextTxId(), resp.handle));
        try {
          await this.serial.waitSysEx(300);
        } catch {
          // ignore close timeout
        }
      }
      await this.serial.sendRaw(audioExecPacket());
      await sleep(20);
      this.serial.drain();
      // also fire pad query (allowed) for hardware-side refresh — response opaque
      try {
        await this.serial.sendRaw(padQueryPacket(padId(bank, pad)));
      } catch {
        // ignore
      }
      return { bank, pad, key, occupied };
    } catch (err) {
      try {
        await this.serial.sendRaw(audioExecPacket());
      } catch {
        // ignore
      }
      this.serial.drain();
      return {
        bank,
        pad,
        key,
        occupied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async exportPadWav(
    projectNum: number,
    bank: SpUsbBank,
    pad: number,
    onProgress?: (have: number, total: number) => void,
  ): Promise<UsbExportResult> {
    if (this.activeProject !== projectNum) {
      await this.selectProject(projectNum);
    }
    const key = `${bank}${String(pad).padStart(2, '0')}`;
    this.serial.drain();

    const txClear = this.serial.nextTxId();
    await this.serial.sendRaw(padSelectClearPacket(txClear));
    await sleep(10);
    await this.serial.sendRaw(padSelectPacket(this.serial.nextTxId(), padId(bank, pad)));

    await this.serial.sendRaw(audioPrepExportPacket());
    await sleep(20);

    const path = formatSamplePath(projectNum, bank, pad);
    await this.serial.sendRaw(sysexOpenRead(this.serial.nextTxId(), path));
    const openResp = await this.serial.waitSysEx(1200);
    if (!openResp.isAck || !openResp.handle || openResp.handle === 0x7f) {
      await this.serial.sendRaw(audioExecPacket());
      throw new Error(`Pad ${key} is empty or not allocated`);
    }
    const handle = openResp.handle;

    await this.serial.sendRaw(sysexReadFile(this.serial.nextTxId(), handle));
    const raw = await this.serial.collectExportStream(
      handle,
      async () => {
        await this.serial.sendRaw(sysexReadFile(this.serial.nextTxId(), handle));
      },
      onProgress,
    );

    await this.serial.sendRaw(sysexCloseFile(this.serial.nextTxId(), handle));
    try {
      await this.serial.waitSysEx(300);
    } catch {
      // ignore
    }
    await this.serial.sendRaw(audioExecPacket());
    await sleep(20);

    const { wav, header } = rfwvStreamToWav(raw);
    return { key, wav, header, fileName: `${key}.wav` };
  }
}
