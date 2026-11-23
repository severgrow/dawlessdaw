import { useState } from 'react';
import type { SeqPattern } from '@dawlessdaw/sequencer';
import type { circuitPatternBars } from '../recorder/circuitPatternCapture';

type Capture = ReturnType<typeof circuitPatternBars>;

export function CircuitPatternCapture({
  inputPort,
  openSetup,
  capture,
  usePattern,
}: {
  inputPort?: string | null;
  openSetup: () => void;
  capture: (bars: number) => Capture | null;
  usePattern: (pattern: SeqPattern) => void;
}) {
  const [bars, setBars] = useState(1);
  const [take, setTake] = useState<{ inputPort: string; capture: Capture } | null>(null);
  const [barIndex, setBarIndex] = useState(0);
  const [usedBar, setUsedBar] = useState<number | null>(null);
  const current = take?.inputPort === inputPort ? take?.capture : null;
  const bar = current?.bars[barIndex];

  return (
    <div className="pattern-capture">
      <h2 className="pattern-group-title">Capture MIDI</h2>
      <div className="pattern-controls" role="group" aria-label="Capture Circuit MIDI">
        <button
          type="button"
          className="seq-btn pattern-primary"
          disabled={!inputPort}
          onClick={() => {
            if (!inputPort) return;
            const result = capture(bars);
            if (!result) return;
            setTake({ inputPort, capture: result });
            const lastNonEmpty = result.bars.map((entry) => entry.notes > 0).lastIndexOf(true);
            setBarIndex(lastNonEmpty < 0 ? result.bars.length - 1 : lastNonEmpty);
            setUsedBar(null);
          }}
        >
          {bars === 1 ? 'Capture last bar' : `Capture last ${bars} bars`}
        </button>
        <label className="seq-field">
          <span className="sr-only">Bars to capture</span>
          <select value={bars} onChange={(event) => setBars(Number(event.target.value))}>
            {[1, 2, 4, 8, 16].map((count) => (
              <option key={count} value={count}>{count} {count === 1 ? 'bar' : 'bars'}</option>
            ))}
          </select>
        </label>
        {current && current.bars.length > 1 ? (
          <label className="seq-field">
            <span className="sr-only">Captured bar</span>
            <select value={barIndex} onChange={(event) => setBarIndex(Number(event.target.value))}>
              {current.bars.map((entry, index) => (
                <option key={entry.label} value={index}>{entry.label}{entry.notes ? '' : ' · empty'}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="seq-btn"
          disabled={!bar?.notes || usedBar === barIndex}
          onClick={() => {
            if (!bar?.notes) return;
            usePattern(bar.pattern);
            setUsedBar(barIndex);
          }}
        >
          Use as Pattern
        </button>
      </div>
      <div className="pattern-capture-status">
        <p className="pattern-feedback" role="status">
          {!inputPort
            ? 'Connect your Circuit Rhythm and assign its MIDI input.'
            : !bar
              ? 'Play on Circuit, then capture the MIDI it sends.'
              : !bar.notes
                ? 'No Circuit notes in this bar. Check Note Tx and play another bar.'
                : [
                    usedBar === barIndex ? 'Saved as Original A' : `${bar.notes} captured notes`,
                    current?.aligned ? bar.label : 'Estimated timing',
                    bar.collisions ? `${bar.collisions} extra hits shared a step` : '',
                    bar.estimatedGates ? `${bar.estimatedGates} gates estimated` : '',
                    bar.clippedGates ? `${bar.clippedGates} gates limited to the grid` : '',
                  ].filter(Boolean).join(' · ')}
        </p>
        {!inputPort ? (
          <button type="button" className="seq-btn" onClick={openSetup}>Set up MIDI</button>
        ) : null}
      </div>
    </div>
  );
}
