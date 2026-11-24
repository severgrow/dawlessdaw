import { useState } from 'react';
import { portsForRoles } from '@dawlessdaw/devices';
import { songTrackOutputs } from '../arranger/songRoutes';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function RouteSignal() {
  const snap = useStudioStore();
  const { getRuntime } = useStudioActions();
  const [track, setTrack] = useState(1);
  const circuitIn = portsForRoles(snap.assignments).circuitIn;
  const input = snap.ports.find((port) => port.id === circuitIn && port.state === 'connected');
  const { input: lastNote, outputs } = getRuntime().circuitRouteSignal(track);
  const destinations = songTrackOutputs(snap.routes, snap.ports, circuitIn, track);
  const ready = destinations.some((destination) => destination.connected);
  return (
    <section className="panel route-signal" aria-labelledby="route-signal-title">
      <div className="row">
        <h2 id="route-signal-title">MIDI signal path</h2>
        <label>Circuit lane{' '}
          <select value={track} onChange={(event) => setTrack(Number(event.target.value))}>
            {Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>T{i + 1}</option>)}
          </select>
        </label>
      </div>
      <dl>
        <div><dt>1 · Input</dt><dd>{!input ? 'Connect Circuit MIDI In' : lastNote ? `Received · Ch ${lastNote.channel} · Note ${lastNote.note}` : 'No MIDI received on this lane'}</dd></div>
        <div><dt>2 · Route</dt><dd>{destinations.map((dest) => `${dest.name} · Ch ${dest.channel}${dest.connected ? '' : ' · Offline'}`).join(' / ') || 'Assign a destination in Live'}</dd></div>
        <div><dt>3 · Output</dt><dd>{!ready ? 'Output offline or unassigned' : outputs.length
          ? outputs.map((out) => `Sent · ${snap.ports.find((port) => port.id === out.port)?.name ?? out.port} · Ch ${out.channel} · Note ${out.note}`).join(' / ')
          : lastNote ? 'No send matched the latest input' : 'Play a Circuit pad to check output'}</dd></div>
      </dl>
    </section>
  );
}
