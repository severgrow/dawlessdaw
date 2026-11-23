/**
 * Isolated Circuit Deep Sync MIDI session.
 * Uses its own Web MIDI access with sysex — never the production RoutingEngine /
 * WebMidiTransport (sysex:false) path.
 */

import {
  buildDeepSyncReport,
  buildIdentityRequest,
  parseNcsSession,
  StockFileProtocolClient,
  summarizeBytes,
  summarizeSession,
  type CustomFirmwareMarker,
  type DeepSyncDiagnosticReport,
  type DeepSyncIdentity,
  type ParsedSession,
  type ProtocolLogEntry,
  type RawMidiMonitorEntry,
} from '@dawlessdaw/devices/circuit-deep-sync';

export type DeepSyncPort = { id: string; name: string; type: 'input' | 'output' };

export type DeepSyncSnapshot = {
  enabled: boolean;
  midiReady: boolean;
  inputs: DeepSyncPort[];
  outputs: DeepSyncPort[];
  inputId: string | null;
  outputId: string | null;
  identity: DeepSyncIdentity | null;
  customFirmware: CustomFirmwareMarker | null;
  loadedStatus: { loaded: number | null; channels: number[] | null } | null;
  session: ParsedSession | null;
  sessionSummary: ReturnType<typeof summarizeSession> | null;
  fileSessionOpen: boolean;
  protocolLog: ProtocolLogEntry[];
  rawMidiLog: RawMidiMonitorEntry[];
  status: string;
};

type Listener = () => void;

function classify(data: Uint8Array): RawMidiMonitorEntry['class'] {
  const s = data[0] ?? 0;
  if (s === 0xf0) return 'sysex';
  if (s === 0xf8 || s === 0xfa || s === 0xfb || s === 0xfc || s === 0xf2) return 'transport';
  const t = s & 0xf0;
  if (t === 0x80 || t === 0x90 || t === 0xb0 || t === 0xc0) return 'performance';
  return 'other';
}

export class DeepSyncController {
  private access: MIDIAccess | null = null;
  private enabled = false;
  private inputId: string | null = null;
  private outputId: string | null = null;
  private identity: DeepSyncIdentity | null = null;
  private customFirmware: CustomFirmwareMarker | null = null;
  private loadedStatus: DeepSyncSnapshot['loadedStatus'] = null;
  private session: ParsedSession | null = null;
  private client: StockFileProtocolClient | null = null;
  private protocolLog: ProtocolLogEntry[] = [];
  private rawMidiLog: RawMidiMonitorEntry[] = [];
  private status = 'Disabled — enable Circuit Deep Sync to open an isolated MIDI session.';
  private listeners = new Set<Listener>();
  private boundHandler: ((ev: MIDIMessageEvent) => void) | null = null;
  private boundInput: MIDIInput | null = null;
  /** Cached for useSyncExternalStore — must be referentially stable between emits. */
  private cachedSnapshot: DeepSyncSnapshot | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.cachedSnapshot = this.buildSnapshot();
    for (const fn of this.listeners) fn();
  }

  /**
   * React useSyncExternalStore requires getSnapshot to return the same
   * object reference until the store notifies. Returning a fresh object
   * each call triggers “Maximum update depth exceeded” and blanks #root
   * (Test tab / lastTab=test cold start).
   */
  getSnapshot(): DeepSyncSnapshot {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = this.buildSnapshot();
    }
    return this.cachedSnapshot;
  }

  private buildSnapshot(): DeepSyncSnapshot {
    const inputs: DeepSyncPort[] = [];
    const outputs: DeepSyncPort[] = [];
    if (this.access) {
      for (const p of this.access.inputs.values()) {
        inputs.push({ id: p.id, name: p.name ?? p.id, type: 'input' });
      }
      for (const p of this.access.outputs.values()) {
        outputs.push({ id: p.id, name: p.name ?? p.id, type: 'output' });
      }
    }
    return {
      enabled: this.enabled,
      midiReady: !!this.access,
      inputs,
      outputs,
      inputId: this.inputId,
      outputId: this.outputId,
      identity: this.identity,
      customFirmware: this.customFirmware,
      loadedStatus: this.loadedStatus,
      session: this.session,
      sessionSummary: this.session ? summarizeSession(this.session) : null,
      fileSessionOpen: this.client?.sessionOpen ?? false,
      protocolLog: [...this.protocolLog, ...(this.client?.protocolLog ?? [])].slice(-200),
      rawMidiLog: this.rawMidiLog.slice(-200),
      status: this.status,
    };
  }

  private setStatus(s: string): void {
    this.status = s;
    this.emit();
  }

  private logInfo(summary: string): void {
    this.protocolLog.push({
      at: Date.now(),
      direction: 'info',
      lane: 'bench',
      summary,
    });
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      throw new Error('Web MIDI unavailable — use Chrome/Edge');
    }
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.enabled = true;
    this.access.onstatechange = () => this.emit();
    this.pickDefaultPorts();
    this.bindInput();
    this.rebuildClient();
    this.logInfo('Isolated Deep Sync MIDI session enabled (sysex:true). Production routing untouched.');
    this.setStatus('Enabled — isolated from production MIDI routing / sequencer / FLIP.');
  }

  async disable(): Promise<void> {
    if (this.client?.sessionOpen) {
      try {
        await this.client.closeSession();
      } catch {
        /* best effort */
      }
    }
    this.unbindInput();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.client = null;
    this.enabled = false;
    this.setStatus('Disabled.');
  }

  private pickDefaultPorts(): void {
    if (!this.access) return;
    const good = (n: string) =>
      /Circuit Rhythm/i.test(n) && !/MIDIIN|MIDIOUT|MIDI 2|MIDI 3|DAW|DIN|Bootloader/i.test(n);
    const ins = [...this.access.inputs.values()];
    const outs = [...this.access.outputs.values()];
    this.inputId = (ins.find((p) => good(p.name ?? '')) ?? ins[0])?.id ?? null;
    this.outputId = (outs.find((p) => good(p.name ?? '')) ?? outs[0])?.id ?? null;
  }

  setInputId(id: string | null): void {
    this.inputId = id;
    this.bindInput();
    this.emit();
  }

  setOutputId(id: string | null): void {
    this.outputId = id;
    this.rebuildClient();
    this.emit();
  }

  private unbindInput(): void {
    if (this.boundInput && this.boundHandler) {
      this.boundInput.onmidimessage = null;
    }
    this.boundInput = null;
    this.boundHandler = null;
  }

  private bindInput(): void {
    this.unbindInput();
    if (!this.access || !this.inputId) return;
    const input = this.access.inputs.get(this.inputId);
    if (!input) return;
    this.boundHandler = (ev) => {
      if (!ev.data) return;
      const data = new Uint8Array(ev.data);
      const entry: RawMidiMonitorEntry = {
        at: performance.now(),
        portId: input.id,
        data: Array.from(data),
        summary: summarizeBytes(data),
        class: classify(data),
      };
      this.rawMidiLog.push(entry);
      if (this.rawMidiLog.length > 500) this.rawMidiLog.shift();
      this.client?.pushRx(data);
      this.emit();
    };
    input.onmidimessage = this.boundHandler;
    this.boundInput = input;
    void input.open();
  }

  private rebuildClient(): void {
    if (!this.access || !this.outputId) {
      this.client = null;
      return;
    }
    const output = this.access.outputs.get(this.outputId);
    if (!output) {
      this.client = null;
      return;
    }
    void output.open();
    this.client = new StockFileProtocolClient((bytes) => {
      output.send(bytes);
    });
  }

  clearLogs(): void {
    this.protocolLog = [];
    this.rawMidiLog = [];
    this.rebuildClient();
    this.emit();
  }

  async probeIdentity(): Promise<void> {
    this.ensureClient();
    this.setStatus('Probing identity (safe read-only)…');
    this.identity = await this.client!.identify();
    this.setStatus(this.identity.summary);
  }

  async probeCustomFirmware(): Promise<void> {
    this.ensureClient();
    this.setStatus('Querying custom firmware marker (safe; null on stock)…');
    this.customFirmware = await this.client!.queryCustomFirmware();
    this.setStatus(
      this.customFirmware.present
        ? `Custom FW: ${this.customFirmware.marker}`
        : 'No custom FW marker (stock or silent) — label: stock MIDI',
    );
  }

  async probeLoadedStatus(): Promise<void> {
    this.ensureClient();
    this.setStatus('Querying loaded pack / channels…');
    this.loadedStatus = await this.client!.queryLoadedStatus();
    this.setStatus(
      this.loadedStatus.channels
        ? `Loaded=${this.loadedStatus.loaded}; ch=${this.loadedStatus.channels.join(',')}`
        : 'No status reply',
    );
  }

  /**
   * Opens file session after caller confirms stop-playback risk, then reads one session file.
   * type=3 Sessions folder (Remix DEV_FOLDERS).
   */
  async readSavedSessionFromDevice(opts: {
    confirmedStopPlayback: boolean;
    pack: number;
    index: number;
  }): Promise<void> {
    this.ensureClient();
    if (!opts.confirmedStopPlayback) throw new Error('Confirmation required');
    this.setStatus(
      'Opening file session — STATE CHANGE: transport stops / panel locks (Remix). Read-only…',
    );
    await this.client!.openSession(true);
    try {
      const bytes = await this.client!.readFile(3, opts.pack, opts.index);
      this.session = parseNcsSession(bytes, 'device-file-read');
      this.session.lane = 'stock-file-protocol';
      this.session.disclaimer =
        'Read via stock USB file protocol from device storage. Saved project data only — not live unsaved sequencer RAM. Opening the session stopped playback.';
      this.setStatus(
        `Read session ${bytes.length} B — ${summarizeSession(this.session).nonEmpty} non-empty patterns (saved storage)`,
      );
    } finally {
      try {
        await this.client!.closeSession();
      } catch (e) {
        this.logInfo(`Close session error: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.emit();
    }
  }

  loadLocalNcs(bytes: Uint8Array, fileName: string): void {
    this.session = parseNcsSession(bytes, 'local-ncs');
    this.logInfo(`Parsed local file ${fileName} (${bytes.length} B) — saved-project-file lane`);
    this.setStatus(`Loaded ${fileName}: ${summarizeSession(this.session).nonEmpty} non-empty patterns`);
  }

  /** Safe no-device probe: send identity only if ports set; otherwise just log. */
  async sendRawIdentity(): Promise<void> {
    this.ensureClient();
    const out = this.access?.outputs.get(this.outputId!);
    if (!out) throw new Error('No output');
    const bytes = buildIdentityRequest();
    out.send(bytes);
    this.protocolLog.push({
      at: Date.now(),
      direction: 'tx',
      lane: 'stock-performance-midi',
      summary: 'Identity request (raw)',
      data: Array.from(bytes),
    });
    this.emit();
  }

  buildReport(): DeepSyncDiagnosticReport {
    return buildDeepSyncReport({
      enabled: this.enabled,
      identity: this.identity,
      customFirmware: this.customFirmware,
      session: this.session,
      protocolLog: this.getSnapshot().protocolLog,
      rawMidiLog: this.rawMidiLog,
    });
  }

  downloadReport(): void {
    const report = this.buildReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `circuit-deep-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private ensureClient(): void {
    if (!this.enabled || !this.client) {
      throw new Error('Enable Circuit Deep Sync and select I/O ports first');
    }
  }
}

export const deepSyncController = new DeepSyncController();
