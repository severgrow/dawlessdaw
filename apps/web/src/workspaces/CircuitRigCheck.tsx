import { useEffect, useState } from 'react';
import { destBadge, destChannel, destHowTo, portsForRoles, spModeANoteToPad } from '@dawlessdaw/devices';
import { songTrackOutputs, songTrackRoutes } from '../arranger/songRoutes';
import { getStudioRuntime, type StudioRuntimeSnapshot } from '../studio/runtime';
import { useStudioStore } from '../store/useStudioStore';

const STORAGE_KEY = 'dawlessdaw.circuit.rig-check';
type Confirmations = Record<string, string>;

function readConfirmations(): Confirmations {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function rigLanes(snap: StudioRuntimeSnapshot, labels: Record<number, string>) {
  const assigned = portsForRoles(snap.assignments);
  return snap.controller.tracks.map((track, index) => {
    const number = index + 1;
    const { dest } = track;
    const routes = songTrackRoutes(snap.routes, assigned.circuitIn, number);
    const outputs = songTrackOutputs(snap.routes, snap.ports, assigned.circuitIn, number);
    const portId = dest?.device === 'mpc' ? assigned.mpcOut
      : dest?.device === 'sp' ? assigned.spOut : dest?.device === 'fm1' ? assigned.fm1Out : null;
    const channel = dest ? destChannel(dest, snap.controller) : null;
    const label = labels[number];
    const key = JSON.stringify([
      assigned.circuitIn, dest, portId, channel, label, dest?.device === 'fm1' ? snap.fm1Firmware : null,
      routes.map((route) => [route.destinations, route.channel?.remap?.[number], route.note, route.velocity]),
    ]);
    const connected = outputs.length === 1 && outputs[0]?.portId === portId &&
      outputs[0].channel === channel && outputs[0].connected;
    return { number, dest, portId, channel, key, connected, label };
  });
}

export function CircuitRigCheck({ labels, onClose }: { labels: Record<number, string>; onClose: () => void }) {
  const snap = useStudioStore();
  const runtime = getStudioRuntime();
  const [confirmed, setConfirmed] = useState(readConfirmations);
  const [unsaved, setUnsaved] = useState(false);
  const lanes = rigLanes(snap, labels);
  const input = portsForRoles(snap.assignments).circuitIn;
  const inputOnline = snap.ports.some((port) => port.id === input && port.type === 'input' && port.state === 'connected');
  const complete = (lane: (typeof lanes)[number]) => confirmed[lane.number] === lane.key;
  const [selected, setSelected] = useState(() => lanes.find((lane) => !complete(lane))?.number ?? 1);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const lane = lanes[selected - 1]!;
  const total = lanes.filter(complete).length;
  const canListen = inputOnline && !snap.circuitTransportActive && snap.songPlayingBar == null;
  const observationKey = JSON.stringify([lane.key, lane.connected]);
  const check = canListen && observationKey === armedKey && snap.routeCheck?.track === selected ? snap.routeCheck : null;
  const result = check?.state === 'done' ? check : null;
  const output = result?.outputs[0];
  const spPad = lane.dest?.device === 'sp' && output ? spModeANoteToPad(output.note) : null;
  const matches = lane.connected && result?.outputs.length === 1 && output?.portId === lane.portId &&
    output?.channel === lane.channel && (lane.dest?.device !== 'sp' || spPad != null);

  useEffect(() => {
    return () => runtime.checkCircuitRoute(null);
  }, [runtime]);

  useEffect(() => {
    if (armedKey != null && (!canListen || armedKey !== observationKey)) {
      setArmedKey(null);
      runtime.checkCircuitRoute(null);
    }
  }, [armedKey, canListen, observationKey, runtime]);

  const select = (number: number) => {
    runtime.checkCircuitRoute(null);
    setArmedKey(null);
    setSelected(number);
  };

  const save = (next: Confirmations) => {
    setConfirmed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
  };

  const confirm = () => {
    save({ ...confirmed, [selected]: lane.key });
    const nextLane = [...lanes.slice(selected), ...lanes.slice(0, selected - 1)].find((item) => !complete(item));
    select(nextLane?.number ?? selected);
  };

  return (
    <section id="circuit-rig-check" className="ctl-quick-control ctl-rig-check" aria-labelledby="rig-check-heading">
      <div className="row">
        <h3 id="rig-check-heading">Check Rig</h3>
        <span className="mono" role="status">{total}/{lanes.length} heard</span>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <p className="muted small">Keep Circuit as clock master. To check a lane, stop playback, tap one pad, and confirm the sound you hear.</p>
      <div className="ctl-rig-lanes" role="group" aria-label="Rig check lanes">
        {lanes.map((item) => (
          <button type="button" key={item.number} aria-pressed={item.number === selected}
            aria-label={`T${item.number} ${complete(item) ? 'heard' : 'unchecked'}`}
            onClick={() => select(item.number)}>
            <span>T{item.number}</span>
            <span className="small">{complete(item) ? 'Heard' : 'Check'}</span>
          </button>
        ))}
      </div>
      <div className="ctl-rig-target">
        <strong>T{selected} · {destBadge(lane.dest)}{lane.label ? ` · ${lane.label}` : ''}</strong>
        {lane.dest && <p className="muted small">
          {lane.dest.device === 'fm1' && snap.fm1Firmware === 'h1'
            ? `Check that the FM1 responds on channel ${lane.channel}. Hold and release a note to check the bass gate.`
            : destHowTo(lane.dest, snap.controller)}
        </p>}
      </div>
      <div className="row">
        <button type="button" className="console-primary" disabled={!canListen} onClick={() => {
          if (check?.state === 'waiting') {
            select(selected);
            return;
          }
          if (complete(lane)) {
            const next = { ...confirmed };
            delete next[selected];
            save(next);
          }
          setArmedKey(observationKey);
          runtime.checkCircuitRoute(selected);
        }}>{check?.state === 'waiting' ? 'Cancel listening' : result ? 'Try another note' : 'Listen for note'}</button>
        <button type="button" disabled={!matches} onClick={confirm}>I heard the right sound</button>
      </div>
      <div role="status" className="small">
        {!inputOnline ? <p>Connect and assign Circuit MIDI In in Setup.</p>
          : !canListen ? <p>Stop Circuit and SPLOT playback before checking a lane.</p>
          : check?.state === 'waiting' ? <p>Tap a pad on Circuit T{selected} and listen for a single hit or note.</p>
          : result ? <>
            <p>Circuit T{selected} sent note {result.note}.</p>
            <ul>{result.outputs.map((sent, i) => (
              <li key={i}>{sent.port} · ch {sent.channel} · note {sent.note}</li>
            ))}</ul>
            <p>{matches ? (spPad != null && lane.dest
              ? `SP Mode A · ${'ABCDEFGHIJ'[lane.dest.slot - 1]}${String(spPad).padStart(2, '0')}. Confirm the pad you heard.`
              : 'Confirm only if you heard the intended sound once.')
              : result.outputs.length === 0 ? 'No output sent. Check the lane destination and port connection.'
              : result.outputs.length > 1 ? 'Multiple outputs sent. Keep one MIDI note path for this lane.'
              : spPad == null && lane.dest?.device === 'sp' && output?.portId === lane.portId && output?.channel === lane.channel
                ? 'That note is outside the SP pad range. Try a mapped Circuit pad.'
                : 'The output does not match the assigned destination. Check its port and channel.'}</p>
          </> : total === lanes.length && !unsaved ? <p>All lanes heard. This check is saved on this Mac.</p>
          : <p>{complete(lane) ? 'You previously confirmed this mapping.' : 'Start listening, then play the sound you want to check.'}</p>}
        {unsaved && <p>Storage is unavailable. These confirmations last until you close Check Rig.</p>}
      </div>
    </section>
  );
}
