import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ClockHealthSnapshot } from '@dawlessdaw/sequencer';
import { portsForRoles } from '@dawlessdaw/devices';
import { HowTo } from '../components/HowTo';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import {
  clearCalibrations,
  loadCalibrations,
  saveCalibration,
  type LatencyCalibration,
} from '../timing/onset';
import {
  runLatencyLab,
  type LatencyDestId,
  type LatencyLabProgress,
  type LatencyLabResult,
} from '../timing/latencyLab';
import { formatInputLabel, listAudioInputs } from '../recorder/devices';
import type { AudioInputDevice } from '../recorder/types';

function useClockHealth(): ClockHealthSnapshot {
  const { getRuntime } = useStudioActions();
  const eng = getRuntime().getClockHealth();
  return useSyncExternalStore(
    (cb) => eng.subscribe(cb),
    () => eng.getSnapshot(),
    () => eng.getSnapshot(),
  );
}

function statusClass(status: ClockHealthSnapshot['status']): string {
  switch (status) {
    case 'STABLE':
      return 'tl-status-stable';
    case 'VARIABLE':
      return 'tl-status-variable';
    case 'CLOCK LOST':
      return 'tl-status-lost';
    default:
      return 'tl-status-unknown';
  }
}

const DEST_META: { id: LatencyDestId; label: string; role: 'mpc' | 'sp404' | 'fm1'; note: number; ch: number }[] =
  [
    { id: 'mpc', label: 'MPC One', role: 'mpc', note: 37, ch: 9 },
    { id: 'sp', label: 'SP-404MKII', role: 'sp404', note: 36, ch: 1 },
    { id: 'fm1', label: 'FM1 (Skiff)', role: 'fm1', note: 60, ch: 1 },
  ];

/**
 * Timing Lab — Settings panel.
 * Stage A: Clock Health (passive). Stage B: MIDI→audio Latency Lab (user-triggered).
 */
export function TimingWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const health = useClockHealth();
  const ports = useMemo(() => portsForRoles(snap.assignments), [snap.assignments]);

  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  const [inputId, setInputId] = useState('');
  const [dest, setDest] = useState<LatencyDestId>('mpc');
  const [progress, setProgress] = useState<LatencyLabProgress | null>(null);
  const [result, setResult] = useState<LatencyLabResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cals, setCals] = useState<LatencyCalibration[]>(() => loadCalibrations());
  const [abort, setAbort] = useState<AbortController | null>(null);

  useEffect(() => {
    void listAudioInputs().then((list) => {
      setInputs(list);
      if (!inputId && list[0]) setInputId(list[0].deviceId);
      if (!list.length) setInputId('');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const destMeta = DEST_META.find((d) => d.id === dest)!;
  const outPortId =
    destMeta.role === 'mpc' ? ports.mpcOut : destMeta.role === 'sp404' ? ports.spOut : ports.fm1Out;
  const inputLabel = inputs.find((i) => i.deviceId === inputId);

  const runLab = async () => {
    setError(null);
    setResult(null);
    if (!outPortId) {
      setError(`Assign ${destMeta.label} MIDI out in Ports & devices first.`);
      return;
    }
    if (!inputId) {
      setError('Plug in an interface (Scarlett / ZED / USB).');
      return;
    }
    const ac = new AbortController();
    setAbort(ac);
    try {
      const res = await runLatencyLab({
        destination: dest,
        midiOutPortId: outPortId,
        midiChannel: destMeta.ch,
        note: destMeta.note,
        audioInputId: inputId,
        audioInputLabel: inputLabel ? formatInputLabel(inputLabel) : inputId,
        sendMidi: (portId, data) => a.getRuntime().sendLatencyLabNote(portId, data),
        onProgress: setProgress,
        signal: ac.signal,
      });
      setResult(res);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setProgress({ phase: 'idle', index: 0, total: 0, message: 'Cancelled.' });
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setProgress({ phase: 'error', index: 0, total: 0, message: 'Failed.' });
      }
    } finally {
      setAbort(null);
    }
  };

  const saveCal = () => {
    if (!result || result.stats.medianMs == null || result.stats.minMs == null || result.stats.maxMs == null) {
      setError('Need at least one onset hit to save calibration.');
      return;
    }
    const next = saveCalibration({
      destination: result.destination,
      audioInputId: result.audioInputId,
      audioInputLabel: result.audioInputLabel,
      medianMs: result.stats.medianMs,
      minMs: result.stats.minMs,
      maxMs: result.stats.maxMs,
      samples: result.stats.hits,
      savedAt: new Date().toISOString(),
      honesty: 'experimental',
    });
    setCals(next);
  };

  return (
    <div className="section-enter timing-page">
      <div className="page-head">
        <h1>timing lab</h1>
        <span className="ci-badge">experimental</span>
      </div>
      <HowTo sentence="Clock health + optional latency ping. Never the clock master.">
        <p>
          Latency includes sound attack and USB — not pure transport delay. No auto correction. Use
          an interface input (not the laptop mic). Headphones if you monitor.
        </p>
      </HowTo>

      {/* ── Stage A: Clock Health ───────────────────────── */}
      <div className="panel tl-clock" role="region" aria-label="Clock Health">
        <div className="tl-clock-head">
          <h2>Clock Health</h2>
          <span className={`tl-status ${statusClass(health.status)}`}>{health.status}</span>
        </div>
        <p className="muted small">{health.reason}</p>
        <div className="tl-metrics">
          <div>
            <span className="tl-k">Clock</span>
            <b>{health.clockDetected ? 'detected' : 'missing'}</b>
          </div>
          <div>
            <span className="tl-k">BPM</span>
            <b>{health.bpm != null ? `≈ ${health.bpm}` : '—'}</b>
          </div>
          <div>
            <span className="tl-k">Fluctuation</span>
            <b>{health.bpmFluctuation != null ? `±${health.bpmFluctuation}` : '—'}</b>
          </div>
          <div>
            <span className="tl-k">Jitter</span>
            <b>{health.jitterMs != null ? `${health.jitterMs} ms` : '—'}</b>
          </div>
          <div>
            <span className="tl-k">Gaps</span>
            <b>{health.gapCount}</b>
          </div>
          <div>
            <span className="tl-k">Restarts</span>
            <b>{health.restartCount}</b>
          </div>
          <div>
            <span className="tl-k">Duplicate?</span>
            <b>{health.possibleDuplicateSources ? 'possible' : 'no'}</b>
          </div>
          <div>
            <span className="tl-k">Confidence</span>
            <b>{health.confidence}</b>
          </div>
        </div>
        {health.position && health.position.bar > 0 ? (
          <p className="mono small muted">
            Position · bar {health.position.bar} beat {health.position.beat}
            {health.position.bpm != null ? ` · ≈${health.position.bpm} BPM` : ''}
          </p>
        ) : null}
        <div className="row" style={{ marginTop: '0.65rem' }}>
          <button type="button" className="ghost" onClick={() => a.getRuntime().resetClockHealth()}>
            Clear clock health
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const json = a.getRuntime().exportClockHealthDiagnostic();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `splot-clock-health-${Date.now()}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* ── Stage B: Latency Lab ────────────────────────── */}
      <div className="panel tl-latency" role="region" aria-label="Latency Lab">
        <h2>MIDI → audio Latency Lab</h2>
        <p className="muted small">
          User-triggered only. Sends a few short notes, listens on the chosen USB input, reports min /
          median / max. Does <strong>not</strong> apply delay correction.
        </p>

        <div className="tl-latency-form">
          <label className="field">
            <span>Destination</span>
            <select
              value={dest}
              onChange={(e) => setDest(e.target.value as LatencyDestId)}
              disabled={Boolean(abort)}
            >
              {DEST_META.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {!(d.role === 'mpc' ? ports.mpcOut : d.role === 'sp404' ? ports.spOut : ports.fm1Out)
                    ? ' (no out)'
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Audio input</span>
            <select
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              disabled={Boolean(abort)}
            >
              {inputs.length === 0 ? (
                <option value="">Plug in an interface</option>
              ) : (
                <>
                  {!inputId ? <option value="">Pick Scarlett / ZED / USB…</option> : null}
                  {inputs.map((i) => (
                    <option key={i.deviceId} value={i.deviceId}>
                      {formatInputLabel(i)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
        </div>

        <div className="row" style={{ marginTop: '0.75rem' }}>
          {!abort ? (
            <button type="button" onClick={() => void runLab()}>
              Run latency test
            </button>
          ) : (
            <button type="button" className="danger" onClick={() => abort.abort()}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => void listAudioInputs().then(setInputs)}
            disabled={Boolean(abort)}
          >
            Refresh inputs
          </button>
        </div>

        {progress ? (
          <p className="mono small status-line-inline" role="status">
            {progress.message}
          </p>
        ) : null}
        {error ? <p className="warn">{error}</p> : null}

        {result ? (
          <div className="tl-result">
            <h3>Result · {result.destination.toUpperCase()}</h3>
            <div className="tl-metrics">
              <div>
                <span className="tl-k">Min</span>
                <b>{result.stats.minMs != null ? `${result.stats.minMs} ms` : '—'}</b>
              </div>
              <div>
                <span className="tl-k">Median</span>
                <b>{result.stats.medianMs != null ? `${result.stats.medianMs} ms` : '—'}</b>
              </div>
              <div>
                <span className="tl-k">Max</span>
                <b>{result.stats.maxMs != null ? `${result.stats.maxMs} ms` : '—'}</b>
              </div>
              <div>
                <span className="tl-k">Hits</span>
                <b>
                  {result.stats.hits}/{result.stats.samples}
                </b>
              </div>
              <div>
                <span className="tl-k">Confidence</span>
                <b>{result.stats.confidence}</b>
              </div>
            </div>
            <p className="muted small">{result.stats.caveat}</p>
            <button type="button" className="ghost" onClick={saveCal} disabled={result.stats.medianMs == null}>
              Save calibration (optional)
            </button>
          </div>
        ) : null}

        {cals.length > 0 ? (
          <div className="tl-cals">
            <h3>Saved calibrations</h3>
            <ul className="mono small">
              {cals.map((c) => (
                <li key={`${c.destination}-${c.audioInputId}-${c.savedAt}`}>
                  {c.destination.toUpperCase()} · median {c.medianMs} ms (min {c.minMs} / max {c.maxMs}) ·{' '}
                  {c.audioInputLabel}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearCalibrations();
                setCals([]);
              }}
            >
              Clear saved
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
