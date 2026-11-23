import { useCallback, useMemo, useRef, useState } from 'react';
import { SP_FW_552_ACK_KEY } from '@dawlessdaw/devices';
import { isFirmwareTested, normalizeFirmware } from './allowlist';
import { BANKS_A_TO_D, type SpUsbBank } from './constants';
import { SpUsbReadOnlyClient, webSerialSupported, type UsbPadSlot } from './client';
import { MoreInfo } from '../../components/MoreInfo';

const LS_KEY = 'dawlessdaw-sp-usb';

function loadFw552Ack(): boolean {
  try {
    return localStorage.getItem(SP_FW_552_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hidden experimental panel: enable with ?spUsb=1 or localStorage dawlessdaw-sp-usb=1. */
export function spUsbPanelEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('spUsb') === '1' || q.get('spUsb') === 'true') {
      window.localStorage.setItem(LS_KEY, '1');
      return true;
    }
    return window.localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

function downloadBlob(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function SpUsbPanel() {
  const clientRef = useRef<SpUsbReadOnlyClient | null>(null);
  if (!clientRef.current) clientRef.current = new SpUsbReadOnlyClient();
  const client = clientRef.current;

  const [connected, setConnected] = useState(false);
  const [backupOk, setBackupOk] = useState(false);
  const [rolandClosed, setRolandClosed] = useState(false);
  const [firmware, setFirmware] = useState('5.51');
  const [fw552Ack, setFw552Ack] = useState(loadFw552Ack);
  const [project, setProject] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [pads, setPads] = useState<UsbPadSlot[] | null>(null);
  const [downloadKey, setDownloadKey] = useState<string | null>(null);

  const serialOk = webSerialSupported();
  const fwTested = isFirmwareTested(firmware);
  const fwNorm = normalizeFirmware(firmware);
  const is552 = fwNorm === '5.52';
  const fw552Blocked = is552 && !fw552Ack;
  const preflightOk = backupOk && rolandClosed && !fw552Blocked;

  const occupied = useMemo(() => (pads ?? []).filter((p) => p.occupied), [pads]);

  const connect = useCallback(async () => {
    if (!backupOk) {
      setStatus('Confirm SD backup first (before Connect).');
      return;
    }
    if (!rolandClosed) {
      setStatus('Quit the Roland SP-404MKII App first (one owner of the serial port).');
      return;
    }
    if (fw552Blocked) {
      setStatus('Firmware 5.52 needs the explicit OK checkbox first (untested — ask Patryk).');
      return;
    }
    if (!serialOk) {
      setStatus('Web Serial needs Chrome or Edge on https / localhost.');
      return;
    }
    setBusy(true);
    setStatus('Opening port…');
    try {
      const info = await client.connect();
      setConnected(true);
      const id =
        info.usbVendorId != null
          ? `VID ${info.usbVendorId.toString(16)} / PID ${(info.usbProductId ?? 0).toString(16)}`
          : 'port open';
      setStatus(
        fwTested
          ? `Connected (${id}). Firmware ${fwNorm} — known-good for this spike.`
          : `Connected (${id}). Firmware ${fwNorm || '(blank)'} ≠ 5.51 — untested; staying read-only.`,
      );
    } catch (err) {
      setConnected(false);
      const msg = err instanceof Error ? err.message : 'Connect failed';
      setStatus(
        `${msg} — If the chooser was empty or open failed on macOS: quit Roland App, use Chrome/Edge, check USB data cable / permissions. See docs/sp404-usb-protocol.md.`,
      );
    } finally {
      setBusy(false);
    }
  }, [backupOk, client, fw552Blocked, fwNorm, fwTested, rolandClosed, serialOk]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await client.disconnect();
      setConnected(false);
      setPads(null);
      setStatus('Disconnected. Safe to reopen Roland App.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }, [client]);

  const listPads = useCallback(async () => {
    if (!connected) return;
    setBusy(true);
    setStatus('Listing pads A–D (SysEx Open probe)…');
    try {
      const slots = await client.listPadsBanksAD(project, (done, total, key) => {
        setStatus(`Listing… ${done}/${total} (${key})`);
      });
      setPads(slots);
      const n = slots.filter((s) => s.occupied).length;
      setStatus(`Project ${project}: ${n} occupied pad${n === 1 ? '' : 's'} in banks A–D.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'List failed');
    } finally {
      setBusy(false);
    }
  }, [client, connected, project]);

  const downloadPad = useCallback(
    async (bank: SpUsbBank, pad: number) => {
      if (!connected) return;
      const key = `${bank}${String(pad).padStart(2, '0')}`;
      setBusy(true);
      setDownloadKey(key);
      setStatus(`Downloading ${key}…`);
      try {
        const result = await client.exportPadWav(project, bank, pad, (have, total) => {
          setStatus(`Downloading ${key}… ${have}/${total} bytes`);
        });
        downloadBlob(result.wav, result.fileName);
        setStatus(
          `Saved ${result.fileName} (${result.header.sampleRate} Hz / ${result.header.channels}ch / ${result.header.bitDepth}-bit).`,
        );
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Download failed');
      } finally {
        setDownloadKey(null);
        setBusy(false);
      }
    },
    [client, connected, project],
  );

  return (
    <div className="panel sp-usb-panel">
      <h2>
        SP USB <span className="tag">experimental</span>
      </h2>
      <p className="muted small">
        Read-only Web Serial (CDC) — list banks A–D, download one WAV. Never writes the device. See{' '}
        <span className="mono">docs/sp404-usb-protocol.md</span>.
      </p>

      {!fwTested ? (
        <p className="warn small" role="status">
          Firmware <span className="mono">{fwNorm || '(empty)'}</span> is not the open404-tested{' '}
          <span className="mono">5.51</span>. Proceed only after an SD backup; session stays read-only.
          {is552 ? (
            <>
              {' '}
              <strong>5.52</strong> needs an explicit OK below before Connect — ask Patryk; do not
              assume it is fine.
            </>
          ) : null}
        </p>
      ) : null}

      <div className="sp-usb-warn">
        <label className="check">
          <input
            type="checkbox"
            checked={backupOk}
            onChange={(e) => setBackupOk(e.target.checked)}
            disabled={connected || busy}
          />{' '}
          I backed up the SD card <strong>before</strong> connecting
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={rolandClosed}
            onChange={(e) => setRolandClosed(e.target.checked)}
            disabled={connected || busy}
          />{' '}
          Roland SP-404MKII App is fully quit (one owner of the serial port)
        </label>
        {is552 ? (
          <label className="check">
            <input
              type="checkbox"
              checked={fw552Ack}
              onChange={(e) => {
                const on = e.target.checked;
                setFw552Ack(on);
                try {
                  localStorage.setItem(SP_FW_552_ACK_KEY, on ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
              disabled={connected || busy}
            />{' '}
            I understand <strong>5.52</strong> is untested here and still want a read-only connect
            (owner confirm)
          </label>
        ) : null}
      </div>

      <div className="row wrap">
        <label>
          Firmware
          <input
            className="mono"
            value={firmware}
            onChange={(e) => setFirmware(e.target.value)}
            disabled={busy}
            placeholder="5.51"
            size={6}
          />
        </label>
        <label>
          Project
          <select
            value={project}
            onChange={(e) => setProject(Number(e.target.value))}
            disabled={busy}
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row">
        {!connected ? (
          <button type="button" disabled={busy || !preflightOk || !serialOk} onClick={() => void connect()}>
            Connect
          </button>
        ) : (
          <button type="button" className="ghost" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        )}
        <button type="button" disabled={busy || !connected} onClick={() => void listPads()}>
          List pads A–D
        </button>
      </div>

      {!serialOk ? (
        <p className="muted small">Web Serial unavailable — use Chrome/Edge on localhost or https.</p>
      ) : null}
      {status ? <p className="mono small status-line-inline">{busy ? `… ${status}` : status}</p> : null}

      {pads ? (
        <div className="sp-usb-banks">
          {BANKS_A_TO_D.map((bank) => {
            const bankPads = pads.filter((p) => p.bank === bank);
            const occ = bankPads.filter((p) => p.occupied).length;
            return (
              <div key={bank} className="sp-usb-bank">
                <h3>
                  Bank {bank}{' '}
                  <span className="muted small">
                    {occ}/16
                  </span>
                </h3>
                <div className="sp-usb-pad-grid">
                  {bankPads.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`sp-usb-pad${p.occupied ? ' occupied' : ''}`}
                      disabled={busy || !p.occupied}
                      title={p.error ?? (p.occupied ? 'Download WAV' : 'Empty')}
                      onClick={() => void downloadPad(p.bank, p.pad)}
                    >
                      {p.key}
                      {downloadKey === p.key ? '…' : p.occupied ? ' ↓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="muted small">
            Occupied: <b>{occupied.length}</b>. Click an occupied pad to download one WAV (read-only).
          </p>
        </div>
      ) : null}

      <MoreInfo>
        <ol className="muted small">
          <li>Back up the SD (whole card or SP BKUP) before Connect.</li>
          <li>Quit Roland SP-404MKII App (and Sparky / open404 CLI).</li>
          <li>USB-C data cable; prefer firmware 5.51.</li>
          <li>Connect → List pads A–D → download one occupied pad.</li>
          <li>Disconnect before reopening Roland App.</li>
        </ol>
        <p className="muted small">
          macOS: Chrome/Edge only; port busy if another CDC client holds it; Safari/Firefox have no Web
          Serial. If the chooser is empty, fall back to Samples → Open SP volume… with the SD in a reader.
        </p>
      </MoreInfo>
    </div>
  );
}
