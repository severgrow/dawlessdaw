import { useEffect, useMemo, useRef, useState } from 'react';
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

interface PadSlot {
  bank: SpBank;
  pad: number;
  sourceName: string;
  audio: PadAudio;
  edit: PadEdit;
}

type DirectoryHandle = {
  getFileHandle: (
    name: string,
    opts: { create: boolean },
  ) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

let sharedContext: AudioContext | null = null;
function audioContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext();
  return sharedContext;
}

async function decodeFile(file: File): Promise<PadAudio> {
  const data = await file.arrayBuffer();
  const buf = await audioContext().decodeAudioData(data);
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

function playAudio(audio: PadAudio): void {
  const ctx = audioContext();
  void ctx.resume();
  const frames = audio.channels[0]?.length ?? 0;
  if (frames === 0) return;
  const buf = ctx.createBuffer(audio.channels.length, frames, audio.sampleRate);
  audio.channels.forEach((c, i) => buf.copyToChannel(new Float32Array(c), i));
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
}

function Waveform({ audio }: { audio: PadAudio }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#d4a017';
    const peaks = waveformPeaks(audio, width);
    peaks.forEach((p, x) => {
      const h = Math.max(1, p * height);
      g.fillRect(x, (height - h) / 2, 1, h);
    });
  }, [audio]);
  return <canvas ref={ref} width={600} height={80} className="sp-wave" />;
}

export function SpSamplesWorkspace() {
  const [bank, setBank] = useState<SpBank>('A');
  const [selected, setSelected] = useState<number>(1);
  const [slots, setSlots] = useState<Record<string, PadSlot>>({});
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const key = padKey(bank, selected);
  const slot = slots[key];
  const edited = useMemo(() => (slot ? applyEdit(slot.audio, slot.edit) : null), [slot]);
  const filled = Object.values(slots);

  const loadInto = async (b: SpBank, pad: number, file: File) => {
    try {
      setStatus(`Loading ${file.name}…`);
      const audio = await decodeFile(file);
      setSlots((prev) => ({
        ...prev,
        [padKey(b, pad)]: {
          bank: b,
          pad,
          sourceName: file.name,
          audio,
          edit: { name: cleanSampleName(file.name), trimStart: 0, trimEnd: null, normalize: false },
        },
      }));
      setStatus(`${file.name} → ${padKey(b, pad)}`);
    } catch {
      setStatus(`Could not read ${file.name}. Try WAV, AIFF or MP3.`);
    }
  };

  /** Several files at once fill the bank from the selected pad onwards. */
  const loadFiles = async (files: FileList | File[], startPad: number) => {
    const list = Array.from(files);
    for (let i = 0; i < list.length && startPad + i <= PADS_PER_BANK; i++) {
      await loadInto(bank, startPad + i, list[i]!);
    }
  };

  const updateEdit = (patch: Partial<PadEdit>) => {
    if (!slot) return;
    setSlots((prev) => ({ ...prev, [key]: { ...slot, edit: { ...slot.edit, ...patch } } }));
  };

  const clearPad = () => {
    setSlots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const exportAll = async () => {
    if (filled.length === 0) return;
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
      .showDirectoryPicker;
    let dir: DirectoryHandle | null = null;
    if (picker) {
      try {
        dir = await picker();
      } catch {
        setStatus('Export cancelled.');
        return;
      }
    }
    let count = 0;
    for (const s of filled.sort((a, b) => padKey(a.bank, a.pad).localeCompare(padKey(b.bank, b.pad)))) {
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
      count++;
    }
    setStatus(`Exported ${count} file${count === 1 ? '' : 's'} (48 kHz, 16-bit WAV).`);
  };

  const duration = slot ? durationSeconds(slot.audio) : 0;

  return (
    <div className="section-enter">
      <h1>SP-404 Samples</h1>
      <p className="lead">
        Plan banks A–D, which Circuit tracks 1–4 play. Load sounds onto pads, trim and normalise,
        then export WAV files to copy onto the SP&apos;s SD card and import on the SP. This page never
        touches the SP&apos;s own project files.
      </p>

      <div className="panel">
        <div className="row">
          {SP_BANKS.map((b, i) => (
            <button
              key={b}
              type="button"
              className={bank === b ? 'active' : ''}
              onClick={() => setBank(b)}
            >
              Bank {b} <span className="muted mono">· Circuit T{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="sp-grid" role="grid" aria-label={`Bank ${bank} pads`}>
          {Array.from({ length: PADS_PER_BANK }, (_, i) => i + 1).map((pad) => {
            const s = slots[padKey(bank, pad)];
            return (
              <button
                key={pad}
                type="button"
                className={`sp-pad${selected === pad ? ' active' : ''}${s ? ' filled' : ''}`}
                onClick={() => {
                  setSelected(pad);
                  if (s) playAudio(applyEdit(s.audio, s.edit));
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setSelected(pad);
                  void loadFiles(e.dataTransfer.files, pad);
                }}
              >
                <span className="mono sp-pad-num">{pad}</span>
                <span className="sp-pad-name">{s ? s.edit.name : 'empty'}</span>
              </button>
            );
          })}
        </div>
        <p className="muted">
          Drag audio files onto a pad (several files fill the next pads). Click a pad to hear it.
        </p>
      </div>

      <div className="panel">
        <h2>
          Pad {key}
          {slot ? <span className="muted mono"> · {slot.sourceName}</span> : null}
        </h2>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.wav,.aif,.aiff,.mp3,.flac"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) void loadFiles(e.target.files, selected);
            e.target.value = '';
          }}
        />
        <div className="row">
          <button type="button" onClick={() => fileInput.current?.click()}>
            {slot ? 'Replace…' : 'Load file…'}
          </button>
          {slot && edited ? (
            <>
              <button type="button" onClick={() => playAudio(edited)}>
                Play
              </button>
              <button type="button" className="danger" onClick={clearPad}>
                Clear pad
              </button>
            </>
          ) : null}
        </div>

        {slot && edited ? (
          <div style={{ marginTop: '0.75rem' }}>
            <Waveform audio={edited} />
            <div className="grid-2" style={{ marginTop: '0.5rem' }}>
              <label>
                Name
                <input
                  type="text"
                  className="text-input"
                  value={slot.edit.name}
                  maxLength={24}
                  onChange={(e) => updateEdit({ name: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={slot.edit.normalize}
                  onChange={(e) => updateEdit({ normalize: e.target.checked })}
                />{' '}
                Normalise (loudest point to just under full volume)
              </label>
              <label>
                Start: {slot.edit.trimStart.toFixed(2)} s
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.01}
                  value={slot.edit.trimStart}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const end = slot.edit.trimEnd ?? duration;
                    updateEdit({ trimStart: Math.min(v, end) });
                  }}
                />
              </label>
              <label>
                End: {(slot.edit.trimEnd ?? duration).toFixed(2)} s
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.01}
                  value={slot.edit.trimEnd ?? duration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateEdit({ trimEnd: v >= duration ? null : Math.max(v, slot.edit.trimStart) });
                  }}
                />
              </label>
            </div>
            <p className="muted mono">
              {padFileName(slot.bank, slot.pad, slot.edit.name)} ·{' '}
              {durationSeconds(edited).toFixed(2)} s ·{' '}
              {slot.audio.channels.length === 1 ? 'mono' : 'stereo'} · source{' '}
              {slot.audio.sampleRate} Hz
            </p>
          </div>
        ) : (
          <p className="muted">Empty pad.</p>
        )}
      </div>

      <div className="panel">
        <h2>Export</h2>
        <p className="lead">
          {filled.length} pad{filled.length === 1 ? '' : 's'} loaded. Files are named by bank and
          pad (for example <span className="mono">A01 kick.wav</span>) as 48 kHz, 16-bit WAV. Pick
          a folder on the SP&apos;s SD card (or anywhere), then on the SP import each file onto its
          pad. Nothing is saved between visits, so export before closing the tab.
        </p>
        <button type="button" disabled={filled.length === 0} onClick={() => void exportAll()}>
          Export {filled.length} WAV file{filled.length === 1 ? '' : 's'}…
        </button>
        {status ? <p className="muted mono">{status}</p> : null}
      </div>
    </div>
  );
}
