import { useState } from 'react';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CIRCUIT_TRACKS_INPUTS } from '../timing/circuitTracksProbe';

export function CircuitTracksProbe() {
  const { getRuntime } = useStudioActions();
  const ports = useStudioStore((s) => s.ports);
  const [isOpen, setOpen] = useState(false);
  const [picked, setPicked] = useState('');
  const inputs = ports.filter((port) => port.type === 'input' && port.state === 'connected');
  const portId = inputs.some((port) => port.id === picked) ? picked : inputs[0]?.id ?? '';
  const notes = isOpen && portId ? getRuntime().recentCircuitTracksNotes(portId) : [];
  return (
    <details className="panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Circuit Tracks MIDI preview</summary>
      <p className="muted small">
        Observe incoming notes using the factory channel map. The preview leaves routing alone and shows channel 10 as a shared drum stream.
      </p>
      <label>
        Preview input{' '}
        <select value={portId} onChange={(event) => setPicked(event.target.value)} disabled={!inputs.length}>
          {!inputs.length && <option value="">No MIDI inputs</option>}
          {inputs.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
        </select>
      </label>
      <p className="mono small">{CIRCUIT_TRACKS_INPUTS.map(({ channel, label }) => `Ch ${channel} · ${label}`).join('  /  ')}</p>
      {notes.length ? (
        <ul aria-label="Recent Circuit Tracks notes">
          {notes.map((note, i) => (
            <li key={i}>{note.label} · Ch {note.channel} · Note {note.pitch} · Velocity {note.velocity}</li>
          ))}
        </ul>
      ) : <p className="muted small">Play a pad or start a sequence to see the first notes.</p>}
    </details>
  );
}
