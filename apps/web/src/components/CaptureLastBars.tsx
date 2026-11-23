/**
 * Minimal “Capture last N bars” control — soft mint, little copy.
 * Observation-only MIDI rolling buffer (experimental).
 */
import { useEffect, useState } from 'react';
import {
  CAPTURE_BAR_OPTIONS,
  captureLastBars,
  ensureRollingMidiCaptureListening,
  formatCaptureResultLine,
  loadPersistedCaptureBars,
  persistCaptureBars,
  type CaptureBarCount,
  type CaptureLastNBarsResult,
} from '../recorder/rollingMidiCaptureHost';

export function CaptureLastBars() {
  const [bars, setBars] = useState<CaptureBarCount>(() => loadPersistedCaptureBars());
  const [last, setLast] = useState<CaptureLastNBarsResult | null>(null);

  useEffect(() => {
    ensureRollingMidiCaptureListening();
  }, []);

  const onBars = (n: CaptureBarCount) => {
    setBars(n);
    persistCaptureBars(n);
  };

  const onCapture = () => {
    const result = captureLastBars(bars);
    setLast(result);
  };

  return (
    <div className="capture-last-bars" data-honesty="experimental">
      <div className="capture-last-bars-row">
        <div className="capture-last-bars-opts" role="group" aria-label="Bars">
          {CAPTURE_BAR_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`capture-bars-opt${bars === n ? ' on' : ''}`}
              aria-pressed={bars === n}
              onClick={() => onBars(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" className="capture-last-bars-go" onClick={onCapture}>
          Capture last {bars} bars
        </button>
      </div>
      {last ? (
        <p className="capture-last-bars-readout mono" title={last.limitations.join(' · ')}>
          {formatCaptureResultLine(last)}
          {last.limitations.length ? ' · experimental' : ''}
        </p>
      ) : (
        <p className="capture-last-bars-readout muted small">MIDI memory · experimental</p>
      )}
    </div>
  );
}
