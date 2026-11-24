import { useState } from 'react';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CIRCUIT_TRACKS_INPUTS } from '../timing/circuitTracksProbe';

const time = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
});

export function CircuitTracksProbe() {
  const { getRuntime } = useStudioActions();
  const ports = useStudioStore((s) => s.ports);
  const [isOpen, setOpen] = useState(false);
  const [picked, setPicked] = useState('');
  const [channel, setChannel] = useState(0);
  const [after, setAfter] = useState(0);
  const [frozen, setFrozen] = useState<ReturnType<ReturnType<typeof getRuntime>['recentCircuitTracksNotes']>>();
  const inputs = ports.filter((port) => port.type === 'input' && port.state === 'connected');
  const portId = inputs.some((port) => port.id === picked) ? picked : inputs[0]?.id ?? '';
  const notes = frozen ?? (isOpen && portId ? getRuntime().recentCircuitTracksNotes(portId, after, channel || undefined) : []);
  return (
    <details className="panel tracks-monitor" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Circuit Tracks MIDI preview</summary>
      <p className="muted small">Profile · Circuit Tracks factory channels · Receive only</p>
      <div className="row">
        <label>Input port{' '}
          <select value={portId} onChange={(event) => setPicked(event.target.value)} disabled={!inputs.length || frozen != null}>
            {!inputs.length && <option value="">No MIDI inputs</option>}
            {inputs.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
          </select>
        </label>
        <label>Channel{' '}
          <select value={channel} disabled={frozen != null} onChange={(event) => setChannel(Number(event.target.value))}>
            <option value={0}>All channels</option>
            {CIRCUIT_TRACKS_INPUTS.map((input) => <option key={input.channel} value={input.channel}>Ch {input.channel} · {input.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setFrozen(frozen ? undefined : notes)}>{frozen ? 'Resume' : 'Freeze'}</button>
        <button type="button" onClick={() => { setAfter(Date.now()); setFrozen(undefined); }}>Clear</button>
      </div>
      {notes.length ? (
        <div className="tracks-monitor-table">
          <table aria-label="Recent Circuit Tracks notes">
            <thead><tr><th>Time</th><th>Lane</th><th>Channel</th><th>Note</th><th>Velocity</th></tr></thead>
            <tbody>{notes.map((note, i) => (
              <tr key={i}><td>{time.format(note.at)}</td><td>{note.label}</td><td>{note.channel}</td><td>{note.pitch}</td><td>{note.velocity}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="muted small">Play a pad or start a sequence to see incoming notes.</p>}
    </details>
  );
}
