import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spBankLetter } from '@dawlessdaw/devices';
import {
  EXPORT_SAMPLE_RATE,
  PADS_PER_BANK,
  SP_BANKS,
  applyEdit,
  cleanSampleName,
  durationSeconds,
  encodeWav16,
  padFileName,
  padKey,
  waveformPeaks,
  type PadAudio,
  type PadEdit,
  type SpBank,
} from '../sp404/samplePrep';
import { deletePad, loadPads, savePad, type StoredPad } from '../sp404/padStore';
import { useStudioStore } from '../store/useStudioStore';

type Slots = Record<string, StoredPad>;

type DirectoryHandle = {
  name?: string;
  getFileHandle: (
    name: string,
    opts: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

let sharedContext: AudioContext | null = null;
function audioContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext();
  return sharedContext;
}

async function decodeFile(file: File): Promise<PadAudio> {
  const buf = await audioContext().decodeAudioData(await file.arrayBuffer());
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    channels.push(new Float32Array(buf.getChannelData(c)));
  }
  return { sampleRate: buf.sampleRate, channels };
}

/** Resample to 48 kHz using the browser's own resampler. */
async function resampleTo48k(audio: PadAudio): Promise<PadAudio> {
  if (audio.sampleRate === EXPORT_SAMPLE_RATE) return audio;
  const frames = audio.channels[0]?.length ?? 0;
  if (frames === 0) return { sampleRate: EXPORT_SAMPLE_RATE, channels: audio.channels };
  const outFrames = Math.ceil((frames * EXPORT_SAMPLE_RATE) / audio.sampleRate);
  const ctx = new OfflineAudioContext(audio.channels.length, outFrames, EXPORT_SAMPLE_RATE);
  const src = ctx.createBuffer(audio.channels.length, frames, audio.sampleRate);
  audio.channels.forEach((c, i) => src.copyToChannel(new Float32Array(c), i));
  const node = ctx.createBufferSource();
  node.buffer = src;
  node.connect(ctx.destination);
  node.start();
  const out = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < out.numberOfChannels; c++) channels.push(new Float32Array(out.getChannelData(c)));
  return { sampleRate: EXPORT_SAMPLE_RATE, channels };
}

let playing: AudioBufferSourceNode | null = null;
function playAudio(audio: PadAudio): void {
  const ctx = audioContext();
  void ctx.resume();
  const frames = audio.channels[0]?.length ?? 0;
  if (frames === 0) return;
  try {
    playing?.stop();
  } catch {
    // already stopped
  }
  const buf = ctx.createBuffer(audio.channels.length, frames, audio.sampleRate);
  audio.channels.forEach((c, i) => buf.copyToChannel(new Float32Array(c), i));
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
  playing = node;
}

/** Whole source waveform, with the trimmed-off parts dimmed. */
function Waveform({ audio, edit }: { audio: PadAudio; edit: PadEdit }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const { width, height } = canvas;
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue('--accent').trim() || '#9a2a45';
    const dim = css.getPropertyValue('--line-hard').trim() || '#3a3a3a';
    const dur = durationSeconds(audio) || 1;
    const x0 = (edit.trimStart / dur) * width;
    const x1 = ((edit.trimEnd ?? dur) / dur) * width;
    g.clearRect(0, 0, width, height);
    waveformPeaks(audio, width).forEach((p, x) => {
      const h = Math.max(1, p * (height - 4));
      g.fillStyle = x >= x0 && x <= x1 ? accent : dim;
      g.fillRect(x, (height - h) / 2, 1, h);
    });
    g.fillStyle = accent;
    g.fillRect(Math.round(x0), 0, 2, height);
    g.fillRect(Math.min(width - 2, Math.round(x1)), 0, 2, height);
  }, [audio, edit.trimStart, edit.trimEnd]);
  return <canvas ref={ref} width={800} height={96} className="sp-wave" aria-label="Waveform" />;
}

/** Which Circuit tracks currently play each SP bank (from the Rig grid). */
function useBankTracks(): Record<string, number[]> {
  const plan = useStudioStore((s) => s.trackPlan);
  return useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [t, sends] of Object.entries(plan)) {
      for (const s of sends) {
        if (s.dest !== 'sp') continue;
        const bank = spBankLetter(s.channel);
        out[bank] = [...(out[bank] ?? []), Number(t)];
      }
    }
    return out;
  }, [plan]);
}

export function SamplesWorkspace() {
  const [bank, setBank] = useState<SpBank>('A');
  const [selected, setSelected] = useState(1);
  const [slots, setSlots] = useState<Slots>({});
  const [restored, setRestored] = useState(false);
  const [status, setStatus] = useState('');
  const [exported, setExported] = useState<string[]>([]);
  const [dragPad, setDragPad] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const bankTracks = useBankTracks();

  // Restore pads saved in this browser.
  useEffect(() => {
    let alive = true;
    void loadPads().then((pads) => {
      if (!alive) return;
      setSlots((prev) => ({ ...Object.fromEntries(pads.map((p) => [p.key, p])), ...prev }));
      setRestored(true);
      if (pads.length) setStatus(`Restored ${pads.length} pad${pads.length === 1 ? '' : 's'} saved in this browser.`);
    });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((pad: StoredPad, delay = 0) => {
    clearTimeout(saveTimers.current[pad.key]);
    saveTimers.current[pad.key] = setTimeout(() => void savePad(pad), delay);
  }, []);

  const key = padKey(bank, selected);
  const slot = slots[key];
  const edited = useMemo(() => (slot ? applyEdit(slot.audio, slot.edit) : null), [slot]);
  const bankCount = (b: SpBank) =>
    Array.from({ length: PADS_PER_BANK }, (_, i) => slots[padKey(b, i + 1)]).filter(Boolean).length;
  const all = Object.values(slots).sort((a, b) => a.key.localeCompare(b.key));
  const inBank = all.filter((s) => s.bank === bank);

  const loadInto = async (b: SpBank, pad: number, file: File): Promise<boolean> => {
    try {
      const audio = await decodeFile(file);
      const k = padKey(b, pad);
      const stored: StoredPad = {
        key: k,
        bank: b,
        pad,
        sourceName: file.name,
        audio,
        edit: { name: cleanSampleName(file.name), trimStart: 0, trimEnd: null, normalize: false },
      };
      setSlots((prev) => ({ ...prev, [k]: stored }));
      persist(stored);
      return true;
    } catch {
      setStatus(`Could not read ${file.name}. Use WAV, AIFF, MP3 or FLAC.`);
      return false;
    }
  };

  /** Several files fill the bank from `startPad` onwards. */
  const loadFiles = async (files: FileList | File[], startPad: number) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(wav|aiff?|mp3|flac|ogg|m4a)$/i.test(f.name));
    if (!list.length) {
      setStatus('No audio files in that drop.');
      return;
    }
    const room = PADS_PER_BANK - startPad + 1;
    let ok = 0;
    for (let i = 0; i < list.length && i < room; i++) {
      setStatus(`Loading ${list[i]!.name}…`);
      if (await loadInto(bank, startPad + i, list[i]!)) ok++;
    }
    const skipped = Math.max(0, list.length - room);
    setStatus(
      `Loaded ${ok} file${ok === 1 ? '' : 's'} into bank ${bank} from pad ${startPad}.` +
        (skipped ? ` ${skipped} didn't fit (bank ${bank} ends at pad 16).` : ''),
    );
  };

  const updateEdit = (patch: Partial<PadEdit>) => {
    if (!slot) return;
    const next = { ...slot, edit: { ...slot.edit, ...patch } };
    setSlots((prev) => ({ ...prev, [key]: next }));
    persist(next, 400);
  };

  const clearPad = (k: string) => {
    clearTimeout(saveTimers.current[k]);
    setSlots((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });
    void deletePad(k);
  };

  const clearBank = () => {
    if (!inBank.length) return;
    if (!window.confirm(`Clear all ${inBank.length} pads in bank ${bank}?`)) return;
    inBank.forEach((s) => clearPad(s.key));
    setStatus(`Bank ${bank} cleared.`);
  };

  /** Drag one pad onto another: move it there (swap if both are full). */
  const movePad = (fromKey: string, toPad: number) => {
    const toKey = padKey(bank, toPad);
    if (fromKey === toKey) return;
    const from = slots[fromKey];
    if (!from) return;
    const to = slots[toKey];
    const moved: StoredPad = { ...from, key: toKey, bank, pad: toPad };
    const back: StoredPad | null = to ? { ...to, key: fromKey, bank: from.bank, pad: from.pad } : null;
    setSlots((prev) => {
      const n = { ...prev, [toKey]: moved };
      if (back) n[fromKey] = back;
      else delete n[fromKey];
      return n;
    });
    persist(moved);
    if (back) persist(back);
    else void deletePad(fromKey);
    setSelected(toPad);
    setStatus(back ? `Swapped ${fromKey} and ${toKey}.` : `Moved ${fromKey} → ${toKey}.`);
  };

  const exportPads = async (pads: StoredPad[], scope: string) => {
    if (!pads.length) return;
    const picker = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirectoryHandle> })
      .showDirectoryPicker;
    let dir: DirectoryHandle | null = null;
    if (picker) {
      try {
        dir = await picker({ mode: 'readwrite' });
      } catch {
        setStatus('Save cancelled.');
        return;
      }
    }
    const written: string[] = [];
    for (const s of pads) {
      setStatus(`Saving ${s.key}…`);
      const audio = await resampleTo48k(applyEdit(s.audio, s.edit));
      const blob = new Blob([encodeWav16(audio)], { type: 'audio/wav' });
      const name = padFileName(s.bank, s.pad, s.edit.name);
      if (dir) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      written.push(name);
    }
    setExported(written);
    setStatus(
      `Saved ${written.length} file${written.length === 1 ? '' : 's'} (${scope})${dir?.name ? ` to “${dir.name}”` : ' to Downloads'}.`,
    );
  };

  // Keyboard: arrows move around the pads, Space plays the selected pad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
      if (move[e.key] !== undefined) {
        e.preventDefault();
        setSelected((p) => Math.min(PADS_PER_BANK, Math.max(1, p + move[e.key]!)));
      } else if (e.key === ' ' && edited) {
        e.preventDefault();
        playAudio(edited);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edited]);

  const duration = slot ? durationSeconds(slot.audio) : 0;
  const tracks = bankTracks[bank];

  return (
    <div className="section-enter samples">
      <div className="page-head">
        <h1>samples</h1>
        <span className="readout">
          loaded <b>{all.length}</b>/160 · {restored ? 'saved in this browser' : 'loading…'}
        </span>
      </div>

      <ol className="steps">
        <li>
          <b>Load</b> — drag audio files onto pads (several files fill the next pads).
        </li>
        <li>
          <b>Shape</b> — name, trim and normalise. Click or press Space to hear it.
        </li>
        <li>
          <b>Save</b> — write 48 kHz WAVs named by pad (e.g. <span className="mono">A01 kick.wav</span>) and
          import them on the SP.
        </li>
      </ol>

      <div className="panel">
        <h2>Bank {bank}</h2>
        <div className="bank-tabs" role="tablist" aria-label="SP banks">
          {SP_BANKS.map((b) => {
            const n = bankCount(b);
            return (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={bank === b}
                className={`bank-tab${bank === b ? ' active' : ''}`}
                onClick={() => setBank(b)}
              >
                {b}
                <span className="bank-count">{n || ''}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">
          {tracks?.length
            ? `Played by Circuit track ${tracks.join(' & ')} (Rig tab, SP in MIDI Mode A).`
            : 'No Circuit track plays this bank right now — set one in the Rig tab if you want it.'}
        </p>

        <div className="sp-grid" role="grid" aria-label={`Bank ${bank} pads`}>
          {Array.from({ length: PADS_PER_BANK }, (_, i) => i + 1).map((pad) => {
            const k = padKey(bank, pad);
            const s = slots[k];
            return (
              <button
                key={pad}
                type="button"
                draggable={Boolean(s)}
                className={`sp-pad${selected === pad ? ' selected' : ''}${s ? ' filled' : ''}${dragPad && dragPad !== k ? ' drop-ok' : ''}`}
                onClick={() => {
                  setSelected(pad);
                  if (s) playAudio(applyEdit(s.audio, s.edit));
                }}
                onDoubleClick={() => {
                  if (!s) fileInput.current?.click();
                }}
                onDragStart={(e) => {
                  setDragPad(k);
                  e.dataTransfer.setData('text/x-sp-pad', k);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragPad(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData('text/x-sp-pad');
                  setDragPad(null);
                  if (from) movePad(from, pad);
                  else if (e.dataTransfer.files.length) {
                    setSelected(pad);
                    void loadFiles(e.dataTransfer.files, pad);
                  }
                }}
                aria-label={`Pad ${pad}${s ? `: ${s.edit.name}` : ', empty'}`}
              >
                <span className="sp-pad-num mono">{k}</span>
                <span className="sp-pad-name">{s ? s.edit.name : 'drop audio'}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <span className="muted small">
            Drag a pad onto another to move it (swaps if both are full). Arrow keys move, Space plays.
          </span>
          <span className="spacer" />
          <button type="button" className="ghost" disabled={!inBank.length} onClick={clearBank}>
            Clear bank {bank}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>
          Pad {key}
          {slot ? <span className="muted mono"> · from {slot.sourceName}</span> : null}
        </h2>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.wav,.aif,.aiff,.mp3,.flac"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void loadFiles(e.target.files, selected);
            e.target.value = '';
          }}
        />
        {slot && edited ? (
          <>
            <Waveform audio={slot.audio} edit={slot.edit} />
            <div className="editor-grid">
              <label>
                Name on the SP
                <input
                  type="text"
                  className="text-input"
                  value={slot.edit.name}
                  maxLength={24}
                  onChange={(e) => updateEdit({ name: e.target.value })}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={slot.edit.normalize}
                  onChange={(e) => updateEdit({ normalize: e.target.checked })}
                />{' '}
                Normalise (loudest point just under full volume)
              </label>
              <label>
                Start {slot.edit.trimStart.toFixed(2)} s
                <input
                  type="range"
                  className="sp-range"
                  min={0}
                  max={duration}
                  step={0.005}
                  value={slot.edit.trimStart}
                  onChange={(e) =>
                    updateEdit({ trimStart: Math.min(Number(e.target.value), slot.edit.trimEnd ?? duration) })
                  }
                />
              </label>
              <label>
                End {(slot.edit.trimEnd ?? duration).toFixed(2)} s
                <input
                  type="range"
                  className="sp-range"
                  min={0}
                  max={duration}
                  step={0.005}
                  value={slot.edit.trimEnd ?? duration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateEdit({ trimEnd: v >= duration ? null : Math.max(v, slot.edit.trimStart) });
                  }}
                />
              </label>
            </div>
            <div className="row">
              <button type="button" onClick={() => playAudio(edited)}>
                ▶ Play
              </button>
              <button type="button" onClick={() => fileInput.current?.click()}>
                Replace…
              </button>
              <button type="button" className="ghost" onClick={() => updateEdit({ trimStart: 0, trimEnd: null })}>
                Reset trim
              </button>
              <span className="spacer" />
              <button type="button" className="danger" onClick={() => clearPad(key)}>
                Clear pad
              </button>
            </div>
            <p className="muted mono small">
              Saves as {padFileName(slot.bank, slot.pad, slot.edit.name)} · {durationSeconds(edited).toFixed(2)} s ·{' '}
              {slot.audio.channels.length === 1 ? 'mono' : 'stereo'} · source {slot.audio.sampleRate} Hz → 48 kHz 16-bit
            </p>
          </>
        ) : (
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) void loadFiles(e.dataTransfer.files, selected);
            }}
          >
            <p>
              Pad {key} is empty. Drop audio here, or{' '}
              <button type="button" onClick={() => fileInput.current?.click()}>
                choose files…
              </button>
            </p>
            <p className="muted small">WAV, AIFF, MP3 or FLAC. Several files fill pads {selected}–16.</p>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Save for the SP</h2>
        <div className="row">
          <button type="button" disabled={!inBank.length} onClick={() => void exportPads(inBank, `bank ${bank}`)}>
            Save bank {bank} ({inBank.length})
          </button>
          <button type="button" disabled={!all.length} onClick={() => void exportPads(all, 'all banks')}>
            Save all ({all.length})
          </button>
        </div>
        {status ? <p className="mono small status-line-inline">{status}</p> : null}
        {exported.length ? (
          <ul className="event-log">
            {exported.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        <ol className="howto">
          <li>Press <b>Save</b>. Chrome asks for a folder: pick one on your Mac (or on the SP&apos;s SD card in a card reader). Files are 48 kHz, 16-bit WAV, named by pad: <span className="mono">A01 …</span> = bank A, pad 1.</li>
          <li>Put the files on the SP: copy them to the SD card and use the SP&apos;s <b>Import</b> (see Roland&apos;s SP-404MKII Reference Manual, “Importing samples”), or drag them onto pads in Roland&apos;s <b>SP-404MKII App</b>.</li>
          <li>Import each file onto the pad its name says.</li>
        </ol>
        <p className="muted small">
          This page never reads or changes the SP&apos;s own project files, and never talks to the SP.
          Your pads are kept in this browser on this Mac until you clear them.
        </p>
      </div>
    </div>
  );
}
