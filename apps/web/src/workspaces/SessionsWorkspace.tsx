/**
 * Sessions — Studio JSON + Session Recorder (local audio takes).
 * Plain-language UI; terminal × hardware look. No upload, no AI in the audio path.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreInfo } from '../components/MoreInfo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import {
  formatInputLabel,
  listAudioInputs,
  loadPersistedInputId,
  persistInputId,
} from '../recorder/devices';
import {
  getCaptureEngine,
  type CaptureStatus,
} from '../recorder/captureEngine';
import { getPerformanceMemory } from '../recorder/performanceMemory';
import { toTakeMarkers } from '@dawlessdaw/sequencer';
import { getFlipEngine } from '../flip/flipEngine';
import {
  deleteTake,
  listTakes,
  loadTakeAudio,
  recoverUnsavedTake,
  updateTakeMeta,
  type TakeMeta,
} from '../recorder/takeStore';
import type { TakeMarker, TakePerformanceEvent } from '../recorder/types';
import {
  clampTrim,
  prepareForExport,
  snapFrameToMarkers,
  stereoPeaks,
} from '../recorder/pcmMath';
import type { StereoAudio } from '../recorder/types';
import {
  DEFAULT_FILENAME_PATTERN,
  downloadBlob,
  exportTake,
  saveBlobsToFolder,
} from '../recorder/exportTake';
import {
  CLIP_LINEAR,
  DEFAULT_FADE_MS,
  MP3_LICENCE_NOTICE,
  RECORDER_MIDI_ARM_KEY,
  type AudioInputDevice,
  type Mp3Mode,
  type WavBitDepth,
} from '../recorder/types';
import { minutesRemaining } from '../recorder/stitch';
import { PADS_PER_BANK, SP_BANKS, padKey, type SpBank } from '../sp404/samplePrep';
import {
  SP_IMPORT_HINT,
  importDestinationLabel,
  importWavFileName,
  sampleNameFromTake,
} from '../sp404/spImportPath';
import {
  SP_VOLUME_BROWSER_HINT,
  encodeSpReadyWav,
  ensureSpVolumeHandleDetailed,
  fileSystemAccessSupported,
  formatSpWriteError,
  getCachedSpVolumeHandle,
  pickSpVolumeDirectoryDetailed,
  readWavFormat,
  restorePersistedSpVolumeHandle,
  writeWavToImport,
} from '../sp404/spVolumeHandle';

function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

function Meter({
  label,
  level,
  clip,
}: {
  label: string;
  level: number;
  clip: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (level / CLIP_LINEAR) * 100));
  return (
    <div className={`rec-meter${clip ? ' clip' : ''}`}>
      <span className="rec-meter-label mono">{label}</span>
      <div className="rec-meter-track" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      {clip ? <span className="rec-clip">CLIP</span> : null}
    </div>
  );
}

export function SessionsWorkspace() {
  const snap = useStudioStore();
  const { exportSession, importSession, getRuntime } = useStudioActions();
  const [raw, setRaw] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(loadPersistedInputId());
  const [midiArm, setMidiArm] = useState(() => {
    try {
      return localStorage.getItem(RECORDER_MIDI_ARM_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [monitorInput, setMonitorInput] = useState(
    () => getCaptureEngine().getMonitorInput(),
  );
  const [status, setStatus] = useState<CaptureStatus>(() => getCaptureEngine().status());
  const [takes, setTakes] = useState<TakeMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audio, setAudio] = useState<StereoAudio | null>(null);
  const [spaceHint, setSpaceHint] = useState<string>('…');
  const [recoverNote, setRecoverNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Edit / export
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [fadeOn, setFadeOn] = useState(true);
  const [normalize, setNormalize] = useState(false);
  const [snapMarkers, setSnapMarkers] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [wavBits, setWavBits] = useState<WavBitDepth>(24);
  const [mp3Mode, setMp3Mode] = useState<Mp3Mode>('cbr320');
  const [splitMarkers, setSplitMarkers] = useState(false);
  const [filenamePattern, setFilenamePattern] = useState(DEFAULT_FILENAME_PATTERN);
  const [exportProgress, setExportProgress] = useState<{ ratio: number; label: string } | null>(
    null,
  );
  const [spBank, setSpBank] = useState<SpBank>('A');
  const [spPad, setSpPad] = useState(1);
  const [spVolumeLabel, setSpVolumeLabel] = useState<string | null>(() =>
    getCachedSpVolumeHandle()?.name ?? null,
  );
  const [spGrantWarning, setSpGrantWarning] = useState<string | null>(null);
  const [spBusy, setSpBusy] = useState(false);
  const [playheadFrame, setPlayheadFrame] = useState<number | null>(null);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const playRef = useRef<AudioBufferSourceNode | null>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const selectedInputRef = useRef<AudioInputDevice | null>(null);
  const startRecordRef = useRef<() => Promise<void>>(async () => undefined);
  const stopRecordRef = useRef<() => Promise<void>>(async () => undefined);

  const selected = takes.find((t) => t.id === selectedId) ?? null;
  const selectedInput = inputs.find((d) => d.deviceId === deviceId) ?? inputs[0] ?? null;
  selectedInputRef.current = selectedInput;

  const refreshTakes = useCallback(async () => {
    const list = await listTakes();
    setTakes(list);
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await listAudioInputs();
      setInputs(list);
      const saved = loadPersistedInputId();
      if (saved && list.some((d) => d.deviceId === saved)) setDeviceId(saved);
      else if (list[0]) setDeviceId(list[0].deviceId);
    })();
    void refreshTakes();
    void (async () => {
      const recovered = await recoverUnsavedTake();
      if (recovered) {
        setRecoverNote(`Recovered unsaved take: ${recovered.meta.name}`);
        await refreshTakes();
        setSelectedId(recovered.meta.id);
      }
    })();
    void (async () => {
      const restored = await restorePersistedSpVolumeHandle();
      if (restored) setSpVolumeLabel(restored.name);
    })();
    try {
      void navigator.storage?.estimate?.().then((est) => {
        const free = (est.quota ?? 0) - (est.usage ?? 0);
        const mins = minutesRemaining(free * 0.8, 48000);
        setSpaceHint(
          `≈ ${Math.floor(mins)} min left at 48 kHz stereo (browser estimate)`,
        );
      });
    } catch {
      setSpaceHint('Storage estimate unavailable');
    }
  }, [refreshTakes]);

  useEffect(
    () =>
      getCaptureEngine().subscribe((s) => {
        setStatus(s);
        setMonitorInput(s.monitorInput);
      }),
    [],
  );

  // Load audio when selection changes
  useEffect(() => {
    if (!selectedId) {
      setAudio(null);
      return;
    }
    let cancelled = false;
    void loadTakeAudio(selectedId).then((a) => {
      if (cancelled) return;
      setAudio(a);
      if (a) {
        setTrimStart(0);
        setTrimEnd(a.left.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Circuit MIDI Start/Stop arm + Program Change markers
  useEffect(() => {
    if (!midiArm) return;
    const runtime = getRuntime();
    const unsub = runtime.bus.on('midi:clock', (ev) => {
      if (ev.type !== 'midi:clock') return;
      const engine = getCaptureEngine();
      if (ev.message.kind === 'start' && engine.status().state === 'idle') {
        void startRecordRef.current();
      } else if (ev.message.kind === 'stop' && engine.status().state === 'recording') {
        void stopRecordRef.current();
      }
    });
    // Project-change markers come from Performance Memory via Circuit Intelligence
    // (confirmed PC). Avoid a second CaptureEngine marker here.
    const unsubIn = runtime.bus.on('midi:in', (ev) => {
      if (ev.type !== 'midi:in') return;
      const m = ev.message;
      if (m.kind !== 'program-change' || m.channel !== 16) return;
      if (getCaptureEngine().status().state !== 'recording') return;
      getPerformanceMemory().ingestMusicalEvents(
        getRuntime().getCircuitIntelligence().getSnapshot().events,
      );
    });
    return () => {
      unsub();
      unsubIn();
    };
  }, [midiArm, getRuntime]);

  // M key = marker while recording or editing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return;
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (getCaptureEngine().status().state === 'recording') {
          const pm = getPerformanceMemory().addManualMarker('Mark');
          if (pm) {
            getCaptureEngine().addMarker(pm.label, 'manual', {
              id: pm.id,
              inferred: false,
            });
          }
          setMsg('Marker added');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Waveform draw
  useEffect(() => {
    const canvas = waveRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || !audio || !selected) return;
    const { width, height } = canvas;
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue('--accent').trim() || '#9fdcc2';
    const alert = css.getPropertyValue('--alert-hi').trim() || '#b5ead3';
    const dim = css.getPropertyValue('--line-hard').trim() || '#3a3a3a';
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#121212';
    g.fillRect(0, 0, width, height);

    const viewFrames = Math.max(1, Math.floor(audio.left.length / zoom));
    const startView = 0;
    const slice: StereoAudio = {
      sampleRate: audio.sampleRate,
      left: audio.left.subarray(startView, startView + viewFrames),
      right: audio.right.subarray(startView, startView + viewFrames),
    };
    const peaks = stereoPeaks(slice, width);
    const mid = height / 2;
    g.strokeStyle = accent;
    g.beginPath();
    for (let x = 0; x < peaks.length; x++) {
      const h = peaks[x]! * (mid - 2);
      g.moveTo(x, mid - h);
      g.lineTo(x, mid + h);
    }
    g.stroke();

    const x0 = (trimStart / audio.left.length) * width;
    const x1 = (trimEnd / audio.left.length) * width;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, x0, height);
    g.fillRect(x1, 0, width - x1, height);
    g.strokeStyle = alert;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x0, height);
    g.moveTo(x1, 0);
    g.lineTo(x1, height);
    g.stroke();
    g.lineWidth = 1;

    for (const m of selected.markers) {
      const x = (m.sample / audio.left.length) * width;
      const inferred = m.inferred === true || m.source === 'inferred';
      g.strokeStyle = inferred
        ? '#c4a574'
        : m.source === 'circuit-project'
          ? alert
          : m.source === 'transport'
            ? '#7eb8a2'
            : '#ecebe6';
      g.setLineDash(inferred ? [4, 3] : []);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, height);
      g.stroke();
      g.setLineDash([]);
    }
    if (playheadFrame != null) {
      const px = (playheadFrame / audio.left.length) * width;
      g.strokeStyle = '#9fdcc2';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, height);
      g.stroke();
      g.lineWidth = 1;
    }
  }, [audio, selected, trimStart, trimEnd, zoom, playheadFrame]);

  const startRecord = useCallback(async () => {
    setMsg(null);
    const input = selectedInputRef.current;
    const label = input ? formatInputLabel(input) : 'Default input';
    const live = useStudioStore.getState();
    const scene = live.scenes.find((s) => s.id === live.activeSceneId);
    try {
      const engine = getCaptureEngine();
      await engine.start({
        deviceId: input?.deviceId ?? null,
        deviceLabel: label,
        tags: {
          tempoBpm: live.estimatedBpm,
          circuitProject: live.lastProject?.index ?? null,
          studioScene: scene?.name ?? null,
          inputDeviceName: label,
        },
      });
      const st = engine.status();
      getPerformanceMemory().setPrefs({
        sectionEventActionsEnabled: live.sectionBridge.eventActionsEnabled === true,
      });
      getPerformanceMemory().start({
        sampleRate: st.sampleRate,
        getFrames: () => getCaptureEngine().status().frames,
      });
      // Seed any recent intel events already observed.
      getPerformanceMemory().ingestMusicalEvents(
        getRuntime().getCircuitIntelligence().getSnapshot().events,
      );
      setMsg('Recording · Performance Memory listening (experimental)');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [getRuntime]);

  const stopRecord = useCallback(async () => {
    const mem = getPerformanceMemory().isActive()
      ? getPerformanceMemory().stop()
      : { events: [], markers: [] };
    const markers = mem.markers.length
      ? (toTakeMarkers(mem.markers) as TakeMarker[])
      : undefined;
    const performanceEvents = mem.events.length
      ? (mem.events as TakePerformanceEvent[])
      : undefined;
    const meta = await getCaptureEngine().stop(
      markers || performanceEvents
        ? { markers: markers ?? [], performanceEvents }
        : undefined,
    );
    await refreshTakes();
    if (meta) {
      setSelectedId(meta.id);
      const n = meta.performanceEvents?.length ?? 0;
      setMsg(
        `Saved take · ${formatTime(meta.durationSec)}${
          n ? ` · ${n} timeline event${n === 1 ? '' : 's'}` : ''
        }`,
      );
    }
  }, [refreshTakes]);

  startRecordRef.current = startRecord;
  stopRecordRef.current = stopRecord;

  const onPickDevice = (id: string) => {
    setDeviceId(id);
    persistInputId(id);
  };

  const toggleMidiArm = () => {
    const next = !midiArm;
    setMidiArm(next);
    try {
      localStorage.setItem(RECORDER_MIDI_ARM_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const toggleMonitorInput = () => {
    const next = !monitorInput;
    setMonitorInput(next);
    getCaptureEngine().setMonitorInput(next);
  };

  const playRegion = (from: number, to: number, loop = false) => {
    if (!audio) return;
    const ctx = new AudioContext({ sampleRate: audio.sampleRate });
    void ctx.resume();
    try {
      playRef.current?.stop();
    } catch {
      // ignore
    }
    const edit = clampTrim(
      {
        startFrame: from,
        endFrame: to,
        fadeInOutMs: fadeOn ? DEFAULT_FADE_MS : 0,
        normalize,
        snapToMarkers: snapMarkers,
      },
      audio.left.length,
    );
    const prepared = prepareForExport(audio, edit);
    const buf = ctx.createBuffer(2, prepared.left.length, prepared.sampleRate);
    buf.copyToChannel(new Float32Array(prepared.left), 0);
    buf.copyToChannel(new Float32Array(prepared.right), 1);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = loop;
    node.connect(ctx.destination);
    node.start();
    playRef.current = node;
  };

  const setTrimWithSnap = (which: 'start' | 'end', frame: number) => {
    if (!audio || !selected) return;
    let f = Math.max(0, Math.min(audio.left.length, Math.round(frame)));
    if (snapMarkers) f = snapFrameToMarkers(f, selected.markers, audio.sampleRate);
    if (which === 'start') setTrimStart(Math.min(f, trimEnd));
    else setTrimEnd(Math.max(f, trimStart));
  };

  const runExport = async (format: 'wav' | 'mp3') => {
    if (!selected || !audio) return;
    setExportProgress({ ratio: 0, label: 'Starting…' });
    try {
      const results = await exportTake(
        selected,
        audio,
        {
          format,
          wavBitDepth: wavBits,
          mp3Mode,
          filename: filenamePattern,
          splitAtMarkers: splitMarkers,
          trim: {
            startFrame: trimStart,
            endFrame: trimEnd,
            fadeInOutMs: fadeOn ? DEFAULT_FADE_MS : 0,
            normalize,
            snapToMarkers: snapMarkers,
          },
        },
        setExportProgress,
      );
      for (const r of results) downloadBlob(r.blob, r.filename);
      const folder = await saveBlobsToFolder(results);
      if (folder === 'saved') setMsg(`Exported ${results.length} file(s) + saved to folder`);
      else setMsg(`Downloaded ${results.length} file(s)`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setExportProgress(null);
    }
  };


  const openSpVolume = async () => {
    setMsg(null);
    setSpGrantWarning(null);
    if (!fileSystemAccessSupported()) {
      setMsg(SP_VOLUME_BROWSER_HINT);
      return;
    }
    const result = await pickSpVolumeDirectoryDetailed({ mode: 'readwrite' });
    if (!result.ok) {
      setMsg(result.message);
      return;
    }
    setSpVolumeLabel(result.handle.name);
    setSpGrantWarning(result.info.warning);
    const where =
      result.info.kind === 'import-folder'
        ? 'IMPORT folder granted — WAVs write here directly'
        : result.info.kind === 'sp-root'
          ? 'SD card root granted — will write into IMPORT/'
          : 'folder granted';
    setMsg(`SP volume ready: “${result.handle.name}” (${where}). Pick a pad, then Write to IMPORT.`);
  };

  const runExportToSpPad = async () => {
    if (!selected || !audio) return;
    setMsg(null);
    if (!fileSystemAccessSupported()) {
      setMsg(SP_VOLUME_BROWSER_HINT);
      return;
    }
    setSpBusy(true);
    setExportProgress({ ratio: 0.05, label: 'Preparing SP WAV…' });
    const sampleName = sampleNameFromTake(selected.name);
    const padFile = importWavFileName(spBank, spPad, sampleName);
    let spWav: ArrayBuffer | null = null;
    try {
      const prepared = prepareForExport(audio, {
        startFrame: trimStart,
        endFrame: trimEnd,
        fadeInOutMs: fadeOn ? DEFAULT_FADE_MS : 0,
        normalize,
        snapToMarkers: snapMarkers,
      });
      setExportProgress({ ratio: 0.35, label: 'Encoding 48 kHz / 16-bit…' });
      spWav = await encodeSpReadyWav(prepared);
      const fmt = readWavFormat(spWav);
      if (fmt.sampleRate !== 48000 || fmt.bitsPerSample !== 16) {
        throw new Error(
          `SP WAV must be 48 kHz / 16-bit (got ${fmt.sampleRate} Hz / ${fmt.bitsPerSample}-bit).`,
        );
      }
      setExportProgress({ ratio: 0.55, label: 'Opening SP volume…' });
      // Reuses memory/IDB grant when writable; otherwise opens the picker (readwrite).
      const rootResult = await ensureSpVolumeHandleDetailed();
      if (!rootResult.ok) {
        downloadBlob(new Blob([spWav], { type: 'audio/wav' }), padFile);
        setMsg(
          `${rootResult.message} Downloaded ${padFile} as fallback — copy it into the card’s IMPORT/ folder, then ${SP_IMPORT_HINT}.`,
        );
        return;
      }
      setSpVolumeLabel(rootResult.handle.name);
      setSpGrantWarning(rootResult.info.warning);
      setExportProgress({
        ratio: 0.8,
        label: `Writing ${padFile}…`,
      });
      const written = await writeWavToImport(
        rootResult.handle,
        { bank: spBank, pad: spPad },
        sampleName,
        spWav,
      );
      const warn = rootResult.info.warning ? ` Note: ${rootResult.info.warning}` : '';
      setMsg(
        `Wrote ${written.relativePath} (${written.bytesWritten} bytes) on “${written.volumeName}”. ${SP_IMPORT_HINT}. Eject the card safely, put it back in the SP, then Import onto pad ${padKey(spBank, spPad)}.${warn}`,
      );
      setExportProgress({ ratio: 1, label: 'Done' });
    } catch (e) {
      const err = formatSpWriteError(e);
      if (spWav) {
        downloadBlob(new Blob([spWav], { type: 'audio/wav' }), padFile);
        setMsg(
          `${err} Downloaded ${padFile} as fallback — copy it into the card’s IMPORT/ folder, then ${SP_IMPORT_HINT}.`,
        );
      } else {
        setMsg(err);
      }
    } finally {
      setSpBusy(false);
      setExportProgress(null);
    }
  };

  const spSampleName = selected ? sampleNameFromTake(selected.name) : 'session';
  const spDest = importDestinationLabel(spBank, spPad, spSampleName);
  const canPickSpVolume = fileSystemAccessSupported();

  const recording = status.state === 'recording';
  const elapsedSec = status.elapsedMs / 1000;

  const tagLine = useMemo(() => {
    if (!selected) return '';
    const t = selected.tags;
    return [
      t.recordedAt.slice(0, 19).replace('T', ' '),
      t.tempoBpm != null ? `${Math.round(t.tempoBpm)} bpm` : null,
      t.circuitProject != null ? `Project ${t.circuitProject}` : null,
      t.studioScene,
      t.inputDeviceName,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [selected]);

  return (
    <div className="section-enter sessions-page">
      <div className="page-head">
        <h1>sessions</h1>
        <span className="readout mono">{spaceHint}</span>
      </div>
      <p className="lead">
        Record stereo from any USB input Chrome sees. Takes stay on this Mac — nothing uploaded.
      </p>

      {recoverNote ? <p className="warn">{recoverNote}</p> : null}
      {msg ? <p className="mono small">{msg}</p> : null}

      <div className="panel rec-capture">
        <h2>Record</h2>
        <label className="field">
          <span>Audio input</span>
          <select
            className="text-input"
            value={selectedInput?.deviceId ?? ''}
            onChange={(e) => onPickDevice(e.target.value)}
            disabled={recording}
          >
            {inputs.length === 0 ? <option value="">No inputs yet — allow mic access</option> : null}
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {formatInputLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="rec-transport">
          <button
            type="button"
            className={`rec-big ${recording ? 'stop' : 'record'}`}
            onClick={() => void (recording ? stopRecord() : startRecord())}
          >
            {recording ? 'Stop' : 'Record'}
          </button>
          <div className="rec-elapsed mono">{formatTime(elapsedSec)}</div>
          <div className="rec-meters">
            <Meter label="L" level={status.meters.left} clip={status.meters.clipLeft} />
            <Meter label="R" level={status.meters.right} clip={status.meters.clipRight} />
          </div>
          <button
            type="button"
            className={midiArm ? 'active' : ''}
            onClick={toggleMidiArm}
            title="Start when Circuit sends MIDI Start; stop on MIDI Stop"
          >
            Follow Circuit Start/Stop {midiArm ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={monitorInput ? 'active' : ''}
            onClick={toggleMonitorInput}
            title="Play the live input through the computer speakers. Off by default — with echo cancel off, monitoring feeds back into the take."
          >
            Monitor input {monitorInput ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!recording}
            onClick={() => {
              const pm = getPerformanceMemory().addManualMarker('Mark');
              if (pm) {
                getCaptureEngine().addMarker(pm.label, 'manual', {
                  id: pm.id,
                  inferred: false,
                });
              }
              setMsg('Marker added (M)');
            }}
          >
            Marker (M)
          </button>
        </div>
        {monitorInput ? (
          <p className="warn small">Monitor on — use headphones if it rings.</p>
        ) : null}
        {snap.estimatedBpm != null ? (
          <p className="mono small">Circuit ≈ {snap.estimatedBpm} bpm</p>
        ) : null}
        <MoreInfo>
          <p className="muted small">
            ZED USB = 16-bit / 48 kHz max; for 24-bit route ZED → Scarlett and pick Scarlett. Raw PCM
            via AudioWorklet (echo cancel / AGC off). Clip at −0.3 dBFS (2 s hold). Performance
            Memory records transport / project / activity / macros / morphs while you record;
            inferred markers are dashed and labelled. Section Bridge event-actions stay off by
            default.
          </p>
        </MoreInfo>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Takes</h2>
          {takes.length === 0 ? (
            <p className="muted">No takes yet.</p>
          ) : (
            <ul className="rec-takes">
              {takes.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={t.id === selectedId ? 'active' : ''}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <strong>{t.name}</strong>
                    <span className="mono small">
                      {formatTime(t.durationSec)} · {new Date(t.createdAt).toLocaleString()}
                      {t.incomplete ? ' · recovered' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected ? (
            <div className="rec-take-actions">
              <label className="field">
                <span>Name</span>
                <input
                  className="text-input"
                  value={selected.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setTakes((prev) =>
                      prev.map((t) => (t.id === selected.id ? { ...t, name } : t)),
                    );
                  }}
                  onBlur={() => void updateTakeMeta(selected.id, { name: selected.name })}
                />
              </label>
              <p className="muted small mono">{tagLine}</p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (!confirm(`Delete “${selected.name}”? This cannot be undone.`)) return;
                  void deleteTake(selected.id).then(() => {
                    setSelectedId(null);
                    void refreshTakes();
                  });
                }}
              >
                Delete take…
              </button>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h2>Edit & export</h2>
          {!selected || !audio ? (
            <p className="muted">Select a take to trim and export.</p>
          ) : (
            <>
              <div className="rec-wave-wrap">
                <canvas
                  ref={waveRef}
                  className="rec-wave"
                  width={640}
                  height={120}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const frame = Math.round(x * audio.left.length);
                    if (e.shiftKey) setTrimWithSnap('end', frame);
                    else setTrimWithSnap('start', frame);
                  }}
                />
                <p className="muted small">
                  Click = start handle · Shift-click = end · markers snap when enabled · playhead =
                  last jumped marker
                </p>
              </div>
              <div className="row wrap" style={{ gap: '0.45rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => playRegion(trimStart, trimEnd)}
                >
                  Play selection
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={playheadFrame == null}
                  onClick={() => {
                    if (playheadFrame == null) return;
                    playRegion(playheadFrame, Math.min(audio.left.length, playheadFrame + audio.sampleRate * 4));
                  }}
                >
                  Jump play from playhead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const clip = await getFlipEngine().importTakeRegion({
                        take: selected,
                        startFrame: trimStart,
                        endFrame: trimEnd,
                        bpm: selected.tags.tempoBpm ?? snap.estimatedBpm ?? undefined,
                      });
                      if (!clip) {
                        setMsg('Could not send range to FLIP (audio missing)');
                        return;
                      }
                      getRuntime().setWorkspace('sequencer');
                      setMsg(`Sent trim to FLIP · ${clip.name}`);
                    })();
                  }}
                >
                  Send trim to FLIP
                </button>
              </div>
              <div className="row wrap">
                <label className="field inline">
                  Start
                  <input
                    className="num-input"
                    type="number"
                    step={0.01}
                    min={0}
                    max={audio.left.length / audio.sampleRate}
                    value={(trimStart / audio.sampleRate).toFixed(2)}
                    onChange={(e) =>
                      setTrimWithSnap('start', Number(e.target.value) * audio.sampleRate)
                    }
                  />
                </label>
                <label className="field inline">
                  End
                  <input
                    className="num-input"
                    type="number"
                    step={0.01}
                    min={0}
                    max={audio.left.length / audio.sampleRate}
                    value={(trimEnd / audio.sampleRate).toFixed(2)}
                    onChange={(e) =>
                      setTrimWithSnap('end', Number(e.target.value) * audio.sampleRate)
                    }
                  />
                </label>
                <label className="field inline">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="row wrap">
                <button
                  type="button"
                  onClick={() => playRegion(trimStart, trimEnd, false)}
                >
                  Play trim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const last5 = Math.max(trimStart, trimEnd - audio.sampleRate * 5);
                    playRegion(last5, trimEnd, false);
                  }}
                >
                  Play last 5 s
                </button>
                <button type="button" onClick={() => playRegion(trimStart, trimEnd, true)}>
                  Loop trim
                </button>
              </div>
              <div className="row wrap">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={fadeOn}
                    onChange={(e) => setFadeOn(e.target.checked)}
                  />
                  10 ms fade in/out at trims (default on)
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={normalize}
                    onChange={(e) => setNormalize(e.target.checked)}
                  />
                  Normalize to −1 dBFS
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={snapMarkers}
                    onChange={(e) => setSnapMarkers(e.target.checked)}
                  />
                  Snap handles to markers
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={splitMarkers}
                    onChange={(e) => setSplitMarkers(e.target.checked)}
                  />
                  Split export at markers
                </label>
              </div>
              <p className="muted small">Trim is export-only — original take stays intact.</p>
              <div className="row wrap">
                <label className="field inline">
                  WAV
                  <select
                    className="text-input"
                    value={wavBits}
                    onChange={(e) => setWavBits(Number(e.target.value) as WavBitDepth)}
                  >
                    <option value={24}>24-bit (default)</option>
                    <option value={16}>16-bit</option>
                    <option value={32}>32-bit float</option>
                  </select>
                </label>
                <label className="field inline">
                  MP3
                  <select
                    className="text-input"
                    value={mp3Mode}
                    onChange={(e) => setMp3Mode(e.target.value as Mp3Mode)}
                  >
                    <option value="cbr320">320 CBR (default)</option>
                    <option value="v0">V0-ish (160 kbps CBR stand-in)</option>
                  </select>
                </label>
              </div>
              <details className="more-info">
                <summary>Filename pattern</summary>
                <div className="more-info-body">
                  <label className="field">
                    <span>Pattern</span>
                    <input
                      className="text-input"
                      value={filenamePattern}
                      onChange={(e) => setFilenamePattern(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <p className="muted small mono">
                    {'{date}'} {'{name}'} {'{bpm}'} {'{part}'}
                  </p>
                </div>
              </details>
              <div className="row wrap">
                <button type="button" className="active" onClick={() => void runExport('wav')}>
                  Export WAV
                </button>
                <button type="button" onClick={() => void runExport('mp3')}>
                  Export MP3
                </button>
              </div>
              {exportProgress ? (
                <div className="rec-progress">
                  <div className="rec-progress-bar">
                    <i style={{ width: `${Math.round(exportProgress.ratio * 100)}%` }} />
                  </div>
                  <span className="mono small">{exportProgress.label}</span>
                </div>
              ) : null}
              <MoreInfo label="MP3 licence">
                <p className="muted small">{MP3_LICENCE_NOTICE}</p>
              </MoreInfo>

              <div className="rec-sp-export" aria-label="Export WAV to SP-404MKII pad">
                <div className="rec-sp-export-head">
                  <h3>Export WAV → SP pad</h3>
                  <span className="rec-sp-hw mono">SP-404MKII · IMPORT</span>
                </div>
                <p className="muted small">
                  48 kHz / 16-bit → SD <span className="mono">IMPORT/</span>. Chrome / Edge · card
                  reader (not USB alone).
                </p>
                <div className="bank-tabs" role="tablist" aria-label="SP banks">
                  {SP_BANKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      role="tab"
                      aria-selected={spBank === b}
                      className={`bank-tab${spBank === b ? ' active' : ''}`}
                      onClick={() => setSpBank(b)}
                      disabled={spBusy}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <div className="sp-grid rec-sp-pad-grid" role="group" aria-label={`Bank ${spBank} pads`}>
                  {Array.from({ length: PADS_PER_BANK }, (_, i) => {
                    const pad = i + 1;
                    const key = padKey(spBank, pad);
                    const selectedPad = spPad === pad;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`sp-pad${selectedPad ? ' selected' : ''}`}
                        aria-pressed={selectedPad}
                        disabled={spBusy}
                        onClick={() => setSpPad(pad)}
                      >
                        <span className="sp-pad-num mono">{key}</span>
                        <span className="sp-pad-name">{selectedPad ? spSampleName : '—'}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="rec-sp-dest mono" role="status">
                  <span className="rec-sp-dest-label">Destination</span>
                  <span className="rec-sp-dest-path">{spDest}</span>
                  {spVolumeLabel ? (
                    <span className="rec-sp-dest-vol">volume “{spVolumeLabel}”</span>
                  ) : (
                    <span className="rec-sp-dest-vol">no volume yet</span>
                  )}
                </div>
                <p className="rec-sp-hint mono">{SP_IMPORT_HINT}</p>
                {spGrantWarning ? <p className="warn small">{spGrantWarning}</p> : null}
                <div className="row wrap">
                  <button
                    type="button"
                    className="ghost"
                    disabled={spBusy || !canPickSpVolume}
                    onClick={() => void openSpVolume()}
                  >
                    {spVolumeLabel ? 'Change SP volume…' : 'Open SP volume…'}
                  </button>
                  <button
                    type="button"
                    className="active rec-sp-write"
                    disabled={spBusy || !canPickSpVolume}
                    onClick={() => void runExportToSpPad()}
                  >
                    Write to IMPORT · {padKey(spBank, spPad)}
                  </button>
                </div>
                {!canPickSpVolume ? (
                  <p className="warn small">{SP_VOLUME_BROWSER_HINT}</p>
                ) : (
                  <MoreInfo>
                    <p className="muted small">
                      Grant card root (IMPORT / EXPORT / BKUP) or the IMPORT folder — not a PROJECT
                      folder. Write failure downloads the same pad WAV as fallback.
                    </p>
                  </MoreInfo>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <div className="panel pm-panel">
          <div className="page-head" style={{ marginBottom: '0.5rem' }}>
            <h2>Performance Memory</h2>
            <span className="ci-badge">experimental</span>
          </div>
          <p className="muted small">
            Event timeline from the take. Inferred rows are labelled — they never auto-fill SP/MPC.
            Original audio stays untouched; observations persist with the take in IndexedDB.
          </p>

          <h3>Markers</h3>
          {selected.markers.length === 0 ? (
            <p className="muted small">No markers on this take.</p>
          ) : (
            <ul className="pm-marker-list">
              {selected.markers.map((m, i) => {
                const id = m.id ?? `legacy-${i}`;
                const inferred = m.inferred === true || m.source === 'inferred';
                return (
                  <li key={id} className={inferred ? 'pm-inferred' : undefined}>
                    <button
                      type="button"
                      className="ghost pm-jump"
                      onClick={() => {
                        setPlayheadFrame(m.sample);
                        setTrimWithSnap('start', m.sample);
                        if (audio) {
                          playRegion(
                            m.sample,
                            Math.min(audio.left.length, m.sample + audio.sampleRate * 2),
                          );
                        }
                      }}
                    >
                      {formatTime(m.seconds)}
                    </button>
                    {editingMarkerId === id ? (
                      <input
                        className="text-input"
                        defaultValue={m.label}
                        autoFocus
                        onBlur={(e) => {
                          const label = e.target.value.trim() || m.label;
                          const next = selected.markers.map((x, j) =>
                            (x.id ?? `legacy-${j}`) === id ? { ...x, label } : x,
                          );
                          setTakes((prev) =>
                            prev.map((t) => (t.id === selected.id ? { ...t, markers: next } : t)),
                          );
                          void updateTakeMeta(selected.id, { markers: next });
                          setEditingMarkerId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setEditingMarkerId(id)}
                        title="Rename"
                      >
                        {m.label}
                      </button>
                    )}
                    <span className="mono small muted">
                      {m.source}
                      {inferred ? ' · inferred' : ''}
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      aria-label="Delete marker"
                      onClick={() => {
                        const next = selected.markers.filter(
                          (x, j) => (x.id ?? `legacy-${j}`) !== id,
                        );
                        setTakes((prev) =>
                          prev.map((t) => (t.id === selected.id ? { ...t, markers: next } : t)),
                        );
                        void updateTakeMeta(selected.id, { markers: next });
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <h3>Event timeline</h3>
          {(selected.performanceEvents?.length ?? 0) === 0 ? (
            <p className="muted small">
              No timeline on this take (record with Performance Memory active, or older take).
            </p>
          ) : (
            <ul className="pm-timeline mono small">
              {selected.performanceEvents!.slice(0, 80).map((ev) => (
                <li key={ev.id} className={ev.inferred ? 'pm-inferred' : undefined}>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setPlayheadFrame(ev.sample);
                      if (audio) playRegion(ev.sample, Math.min(audio.left.length, ev.sample + audio.sampleRate));
                    }}
                  >
                    {formatTime(ev.seconds)}
                  </button>
                  <span>
                    {ev.inferred ? 'inferred · ' : ''}
                    {ev.summary}
                  </span>
                  <span className="muted">{ev.kind}</span>
                  {ev.kind === 'project-change' && !ev.inferred ? (
                    <button
                      type="button"
                      className="ghost"
                      title="Requires Section Bridge event-actions on"
                      onClick={() => {
                        const ok = getRuntime().runPerformanceSectionEventAction(ev);
                        setMsg(
                          ok
                            ? 'Replayed Section Bridge for confirmed project event'
                            : 'Event-actions off or blocked — nothing sent',
                        );
                      }}
                    >
                      Replay bridge
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <details className="panel collapsed-chrome">
        <summary>
          <h2>Studio session JSON</h2>
        </summary>
        <p className="muted small">Routes / scenes / setup — local only, separate from audio takes.</p>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => {
              setRaw(exportSession());
              setJsonError(null);
            }}
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                importSession(raw);
                setJsonError(null);
              } catch (e) {
                setJsonError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Import JSON
          </button>
        </div>
        {jsonError ? <p style={{ color: 'var(--err)' }}>{jsonError}</p> : null}
        <textarea
          className="session-io"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Session JSON…"
          spellCheck={false}
        />
      </details>
    </div>
  );
}
