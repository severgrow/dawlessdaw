import { useEffect, useState } from 'react';
import {
  CIRCUIT_MACRO_CCS,
  CTRL_DEVICES,
  DEVICE_NAME,
  SLOT_COUNT,
  controllerWarnings,
  destBadge,
  destChannel,
  destHowTo,
  destPad1Note,
  knobTarget,
  portsForRoles,
  slotLabel,
  slotLabelText,
  targetsFor,
  trackTranspose,
  type ControllerPreset,
  type CtrlDevice,
  type CtrlTrack,
  type KnobSlot,
} from '@dawlessdaw/devices';
import { LiveTake } from './LiveTake';
import { CircuitRigCheck } from './CircuitRigCheck';
import { songTrackOutputs } from '../arranger/songRoutes';
import { DeviceArt } from '../components/DeviceArt';
import { MoreInfo } from '../components/MoreInfo';
import { setUiSelection, useUiSelection } from '../nav/uiSelection';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** MIDI 60 = C4 */
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

const ROLE_OF: Record<CtrlDevice, 'sp404' | 'fm1' | 'mpc'> = { sp: 'sp404', fm1: 'fm1', mpc: 'mpc' };
const DEVICE_BLURB: Record<CtrlDevice, string> = {
  sp: 'Banks A–J · pads · effect knobs',
  fm1: 'Skiff tracks 1–6 · synth knobs',
  mpc: 'Tracks 1–8 · learnable knobs',
};

function availableSlot(preset: ControllerPreset, track: number, device: CtrlDevice): number | undefined {
  const current = preset.tracks[track - 1]?.dest;
  if (current?.device === device) return current.slot;
  const used = new Set(preset.tracks.flatMap((entry, index) =>
    index !== track - 1 && entry.dest?.device === device ? [destChannel(entry.dest, preset)] : [],
  ));
  return Array.from({ length: SLOT_COUNT[device] }, (_, i) => i + 1)
    .find((slot) => !used.has(destChannel({ device, slot }, preset)));
}

function devClass(d: CtrlDevice | null | undefined) {
  return d ? `dev-${d}` : 'dev-off';
}

/** Round on-screen knob: arc + pointer follow the real knob's value. */
function Knob({ value, pulse, device, label }: { value: number; pulse: number; device: CtrlDevice | null; label: string }) {
  const a0 = -135;
  const a = a0 + (value / 127) * 270;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const arc = (from: number, to: number, r: number) => {
    const p = (d: number) => `${24 + r * Math.cos(rad(d))} ${24 + r * Math.sin(rad(d))}`;
    return `M ${p(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
  };
  return (
    <svg viewBox="0 0 48 48" className={`ctl-knob ${devClass(device)}`} role="img" aria-label={`${label}: ${value}`}>
      <path d={arc(-135, 135, 20)} className="kn-track" />
      {value > 0 ? <path d={arc(-135, a, 20)} className="kn-arc" /> : null}
      <circle key={pulse} cx="24" cy="24" r="14" className={`kn-cap${pulse ? ' kn-glow' : ''}`} />
      <line x1="24" y1="24" x2={24 + 11 * Math.cos(rad(a))} y2={24 + 11 * Math.sin(rad(a))} className="kn-ptr" />
    </svg>
  );
}

function PadMap({ track }: { track: CtrlTrack }) {
  const base = destPad1Note(track.dest);
  if (base == null || !track.dest) {
    return <p className="muted small">The FM1 plays notes as they come — no pad map needed.</p>;
  }
  const first = track.firstNote ?? base;
  return (
    <div className="pad-map" aria-label="Which Circuit note hits which pad">
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className={`pm-pad ${devClass(track.dest!.device)}`}>
          <b>pad {i + 1}</b>
          <span>
            {first + i} · {noteName(first + i)}
          </span>
        </div>
      ))}
    </div>
  );
}

function KnobRow({
  preset,
  trackNo,
  k,
  advanced,
}: {
  preset: ControllerPreset;
  trackNo: number;
  k: number;
  advanced: boolean;
}) {
  const snap = useStudioStore();
  const a = useStudioActions();
  const track = preset.tracks[trackNo - 1]!;
  const slot = track.knobs[k]!;
  const device = track.dest?.device ?? null;
  const tgt = knobTarget(slot.target);
  const twisting = snap.controllerLearn?.kind === 'twist' && snap.controllerLearn.track === trackNo && snap.controllerLearn.knob === k;
  const live = snap.lastKnob && snap.lastKnob.track === trackNo && snap.lastKnob.knob === k ? snap.lastKnob.at : 0;
  const set = (patch: Partial<KnobSlot>) => a.setControllerKnob(trackNo, k, patch);
  return (
    <div className={`knob-row${live ? ' moved' : ''}`} key={live}>
      <span className="kr-num">
        <Knob value={snap.knobValues[trackNo - 1]?.[k] ?? 0} pulse={live} device={slot.target ? device : null} label={`Knob ${k + 1}`} />
        <b>{k + 1}</b>
      </span>
      <span className="kr-target">
        <select
          className="select-inline"
          value={slot.target ?? ''}
          aria-label={`Knob ${k + 1} target`}
          disabled={!device}
          onChange={(e) => set({ target: e.target.value || null, ...(e.target.value === 'custom' ? { cc: slot.cc ?? 102 } : {}) })}
        >
          <option value="">— not mapped (dropped)</option>
          {device
            ? targetsFor(device).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {advanced && t.cc != null ? ` · CC ${t.cc}` : ''}
                </option>
              ))
            : null}
          {advanced ? <option value="custom">Custom CC…</option> : null}
        </select>
        {slot.target === 'custom' ? (
          <input
            className="num-input"
            type="number"
            min={0}
            max={119}
            aria-label="Custom CC number"
            value={slot.cc ?? ''}
            onChange={(e) => set({ cc: Math.max(0, Math.min(119, Math.round(Number(e.target.value) || 0))) })}
          />
        ) : null}
        {slot.pickup ? <span className="kr-hint">Pickup on</span> : null}
        {tgt?.hint ? <span className="kr-hint">{tgt.hint}</span> : null}
        {advanced ? (
          <span className="kr-hint mono">
            in: CC {CIRCUIT_MACRO_CCS[k]} ch{trackNo}
            {track.dest ? ` → out: ch${destChannel(track.dest, preset)}` : ''}
          </span>
        ) : null}
      </span>
      <span className="kr-range" aria-label="Range">
        <span className="range2">
          <input
            type="range"
            min={0}
            max={127}
            value={slot.min}
            aria-label={`Knob ${k + 1} minimum`}
            disabled={!slot.target || tgt?.kind === 'steps'}
            onChange={(e) => set({ min: Number(e.target.value) })}
          />
          <input
            type="range"
            min={0}
            max={127}
            value={slot.max}
            aria-label={`Knob ${k + 1} maximum`}
            disabled={!slot.target || tgt?.kind === 'steps'}
            onChange={(e) => set({ max: Number(e.target.value) })}
          />
        </span>
        <span className="mono small">
          {slot.min}–{slot.max}
        </span>
      </span>
      <span className="kr-actions">
        <button
          type="button"
          className={twisting ? 'active' : 'ghost'}
          title="Press, then turn the real Circuit knob you want for this setting"
          onClick={() => (twisting ? a.cancelControllerLearn() : a.twistToPick(trackNo, k))}
        >
          {twisting ? 'turn a knob…' : 'twist to pick'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!slot.target || tgt?.kind === 'steps'}
          title="Sends a slow sweep to this setting so you can hear or see it move"
          onClick={() => a.testControllerKnob(trackNo, k)}
        >
          test
        </button>
      </span>
    </div>
  );
}

function QuickKnobLearn({ trackNo, device }: { trackNo: number; device: CtrlDevice }) {
  const snap = useStudioStore();
  const actions = useStudioActions();
  const [target, setTarget] = useState('');
  const learn = snap.controllerLearn;
  const learning = learn?.kind === 'target' && learn.track === trackNo;
  const mapped = snap.learnedKnob;
  const saved = mapped?.track === trackNo &&
    snap.controller.tracks[trackNo - 1]?.knobs[mapped.knob]?.target === mapped.target ? mapped : null;
  const source = portsForRoles(snap.assignments).circuitIn;
  const ready = snap.ports.some((port) => port.id === source && port.state === 'connected');
  const notesOnly = device === 'fm1' && snap.fm1Firmware === 'h1';

  return (
    <div className="ctl-quick-control">
      <h3>Knob Learn</h3>
      <div className="row">
        <label>
          <span className="sr-only">Knob Learn target</span>
          <select className="select-inline" value={target} disabled={learning || notesOnly} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose a parameter…</option>
            {targetsFor(device).filter((item) => item.kind === 'cc').map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className={learning ? 'active' : 'console-primary'}
          disabled={!learning && (!target || !ready || notesOnly)}
          onClick={() => learning ? actions.cancelControllerLearn() : actions.beginKnobLearn(trackNo, target)}>
          {learning ? 'Cancel learn' : 'Learn knob'}
        </button>
      </div>
      <p className="muted small" role="status">
        {learning ? `Select T${trackNo} on Circuit and turn the knob you want to use.` :
          saved ? `T${trackNo} · Knob ${saved.knob + 1} → ${knobTarget(saved.target)?.label}. Pickup on.` :
          notesOnly ? 'This FM1 profile sends notes only.' :
          !ready ? 'Connect the Circuit MIDI input to learn a knob.' :
          'Choose a parameter and turn a knob on the Circuit to save it.'}
      </p>
    </div>
  );
}

function CircuitRouteCheck({ trackNo }: { trackNo: number }) {
  const snap = useStudioStore();
  const { checkCircuitRoute } = useStudioActions();
  const assigned = portsForRoles(snap.assignments);
  const input = assigned.circuitIn;
  const dest = snap.controller.tracks[trackNo - 1]?.dest;
  const configured = songTrackOutputs(snap.routes, snap.ports, input, trackNo);
  const ready = snap.ports.some((port) => port.id === input && port.state === 'connected');
  const check = snap.routeCheck?.track === trackNo ? snap.routeCheck : null;
  const waiting = check?.state === 'waiting';
  const playing = snap.songPlayingBar != null;
  function hardwareHint(out: { portId: string; channel: number; note: number }) {
    const expected = dest?.device === 'mpc' ? assigned.mpcOut :
      dest?.device === 'sp' ? assigned.spOut : dest?.device === 'fm1' ? assigned.fm1Out : undefined;
    if (dest && out.portId === expected && destChannel(dest, snap.controller) === out.channel) {
      const padHint = dest.device === 'sp' && (out.note < 36 || out.note > 51) ? ' Check the target pad’s note in the SP MIDI chart.' : '';
      return destHowTo(dest, snap.controller) + padHint;
    }
    return `Set the receiving device to MIDI channel ${out.channel} and check its note mapping for ${out.note}.`;
  }

  return (
    <div className="ctl-quick-control">
      <div className="row">
        <h3>Route check</h3>
        <button type="button" disabled={!waiting && (!ready || playing)}
          className={waiting ? 'active' : ''}
          onClick={() => checkCircuitRoute(waiting ? null : trackNo)}>
          {waiting ? 'Cancel check' : 'Check route'}
        </button>
      </div>
      <div role="status" className="muted small">
        {waiting ? `Tap one pad on Circuit T${trackNo}. SPLOT will show the MIDI it sends.` :
          check?.state === 'done' ? (
            <>
              <strong>Circuit T{trackNo} · Note {check.note}</strong>
              {check.outputs.length ? (
                <ul>{check.outputs.map((out, i) => (
                  <li key={i}>
                    <strong>{out.port} · ch {out.channel} · note {out.note}</strong>
                    <div>{hardwareHint(out)}</div>
                  </li>
                ))}</ul>
              ) : <p>No output sent. {configured.length === 0 ? 'Choose a MIDI destination for this Circuit track.' :
                configured.every((out) => !out.connected) ? 'Reconnect the assigned output or select an online MIDI port in Setup.' :
                'Check the routing rules and note range for this track.'}</p>}
            </>
          ) : playing ? 'Stop Song playback to check live notes.' :
          ready ? 'Check the output port, channel, and note SPLOT sends. Listen for the expected sound on the receiving device.' : 'Connect the Circuit MIDI input to check a route.'}
      </div>
    </div>
  );
}

function TrackPanel({ trackNo, advanced }: { trackNo: number; advanced: boolean }) {
  const snap = useStudioStore();
  const a = useStudioActions();
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const preset = snap.controller;
  const track = preset.tracks[trackNo - 1]!;
  const dest = track.dest;
  const learning = snap.controllerLearn?.kind === 'first-note' && snap.controllerLearn.track === trackNo;

  return (
    <div className={`panel track-panel ${devClass(dest?.device)}`}>
      <h2>
        3 · T{trackNo} <span className="muted">· {destBadge(dest)}</span>
      </h2>

      <h3>Destination</h3>
      <div className="dest-choice" role="radiogroup" aria-label="Destination device">
        {CTRL_DEVICES.map((d) => {
          const slot = availableSlot(preset, trackNo, d);
          return <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dest?.device === d}
            className={`dest-btn ${devClass(d)}${dest?.device === d ? ' active' : ''}`}
            disabled={slot == null}
            title={slot == null ? 'All channels for this device are assigned' : undefined}
            onClick={() => slot != null && a.setControllerTrack(trackNo, { dest: { device: d, slot } })}
          >
            <DeviceArt kind={d} className="dest-art" />
            {DEVICE_NAME[d]}
          </button>;
        })}
        <button
          type="button"
          role="radio"
          aria-checked={!dest}
          className={`dest-btn dev-off${!dest ? ' active' : ''}`}
          onClick={() => a.setControllerTrack(trackNo, { dest: null })}
        >
          <span className="dest-off-glyph">—</span>
          Off
        </button>
      </div>
      {dest ? (
        <div className="slot-row">
          <label>
            {dest.device === 'sp' ? 'Bank' : 'Track'}{' '}
            <select
              className="select-inline big-select"
              value={dest.slot}
              onChange={(e) => a.setControllerTrack(trackNo, { dest: { device: dest.device, slot: Number(e.target.value) } })}
            >
              {Array.from({ length: SLOT_COUNT[dest.device] }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {slotLabel({ device: dest.device, slot: n })}
                  {` · ch ${destChannel({ device: dest.device, slot: n }, preset)}`}
                </option>
              ))}
            </select>
          </label>
          <p className="howto-line">{destHowTo(dest, preset)}</p>
        </div>
      ) : (
        <p className="muted">Off — the app sends nothing for this track.</p>
      )}

      <div className="ctl-quick-controls">
        {dest ? <QuickKnobLearn key={`${trackNo}-${dest.device}`} trackNo={trackNo} device={dest.device} /> : null}
      </div>

      {dest && destPad1Note(dest) != null ? (
        <>
          <h3>Which note starts it?</h3>
          <div className="row">
            <button
              type="button"
              className={`learn-big${learning ? ' active learn-focus' : ''}`}
              onClick={() => (learning ? a.cancelControllerLearn() : a.learnFirstNote(trackNo))}
            >
              {learning ? `● Listening — play pad 1 on T${trackNo}` : '♪ Learn first note'}
            </button>
            <span className="mono">
              {track.firstNote != null
                ? `Note ${track.firstNote} (${noteName(track.firstNote)}) = pad 1`
                : 'Notes pass unchanged'}
              {advanced && trackTranspose(track)
                ? ` · shift ${trackTranspose(track) > 0 ? '+' : ''}${trackTranspose(track)}`
                : ''}
            </span>
            {track.firstNote != null ? (
              <button type="button" className="ghost" onClick={() => a.setControllerTrack(trackNo, { firstNote: null })}>
                no shift
              </button>
            ) : null}
          </div>
          <details className="more-info">
            <summary>Pad map</summary>
            <div className="more-info-body">
              <PadMap track={track} />
              {dest.device === 'mpc' ? (
                <p className="muted small">MPC Classic pad map: pad 1 = note 37.</p>
              ) : null}
            </div>
          </details>
        </>
      ) : null}

      <h3>Shape · knobs</h3>
      <p className="muted small">
        8 macros on T{trackNo}. Unmapped = dropped.
        {dest?.device === 'mpc' ? ' Use Learn + test to bind.' : ''}
      </p>
      <div className="knob-page">
        {Array.from({ length: 8 }, (_, k) => (
          <KnobRow key={k} preset={preset} trackNo={trackNo} k={k} advanced={advanced} />
        ))}
      </div>

      {advanced ? (
        <>
          <h3>Copy track {trackNo} to…</h3>
          <div className="row">
            {Array.from({ length: 8 }, (_, i) => i + 1)
              .filter((t) => t !== trackNo)
              .map((t) => (
                <label key={t} className="check-pill">
                  <input
                    type="checkbox"
                    checked={copyTo.includes(t)}
                    onChange={(e) => setCopyTo((c) => (e.target.checked ? [...c, t] : c.filter((x) => x !== t)))}
                  />
                  T{t}
                </label>
              ))}
            <button
              type="button"
              disabled={!copyTo.length}
              onClick={() => {
                a.copyControllerTrack(trackNo, copyTo);
                setCopyTo([]);
              }}
            >
              Copy
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PresetBar({ advanced, setAdvanced }: { advanced: boolean; setAdvanced: (v: boolean) => void }) {
  const snap = useStudioStore();
  const a = useStudioActions();
  const current = snap.controllerPresets.find((p) => p.id === snap.controllerSavedId);
  return (
    <div className="preset-bar">
      <label className="pb-field">
        <span className="ap-label">Preset</span>
        <select className="select-inline big-select" value={snap.controllerSavedId} onChange={(e) => a.loadControllerPreset(e.target.value)}>
          {snap.controllerPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.builtIn ? ' (built-in)' : ''}
            </option>
          ))}
        </select>
      </label>
      {snap.controllerDirty ? <span className="readout">changed</span> : null}
      <button type="button" onClick={() => a.saveControllerPreset()} title={current?.builtIn ? 'Built-ins stay as they are: saves a copy' : 'Save changes'}>
        Save
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          const name = window.prompt('Name for the new preset', `${current?.name ?? 'My preset'} copy`);
          if (name) a.saveControllerPresetAs(name);
        }}
      >
        Save as…
      </button>
      {current && !current.builtIn ? (
        <>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const name = window.prompt('Rename preset', current.name);
              if (name) a.renameControllerPreset(current.id, name);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => window.confirm(`Delete preset “${current.name}”?`) && a.deleteControllerPreset(current.id)}
          >
            Delete
          </button>
        </>
      ) : null}
      <span className="spacer" />
      <button type="button" className="ghost" disabled={!snap.controllerUndoCount} onClick={() => a.undoController()} title="Undo (⌘Z)">
        ↶ Undo {snap.controllerUndoCount ? `(${snap.controllerUndoCount})` : ''}
      </button>
      <button
        type="button"
        className={advanced ? 'active' : 'ghost'}
        onClick={() => setAdvanced(!advanced)}
        title="MIDI channels, CC numbers, copy track, Skiff channels"
      >
        Advanced
      </button>
    </div>
  );
}

const SOUND_LABELS_KEY = 'dawlessdaw.circuit.sound-labels';

function readSoundLabels(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(SOUND_LABELS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function ControllerWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const preset = snap.controller;
  const uiSel = useUiSelection();
  const [selected, setSelectedLocal] = useState<number>(() => uiSel.controllerTrack);
  const [soundLabels, setSoundLabels] = useState(readSoundLabels);
  const [checkingRig, setCheckingRig] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(() => {
    try {
      return localStorage.getItem('dawlessdaw.ctrlAdvanced') === '1';
    } catch {
      return false;
    }
  });

  const setSelected = (t: number) => {
    if (t !== selected) {
      if (!checkingRig && snap.routeCheck?.state === 'waiting') a.checkCircuitRoute(null);
      if (snap.controllerLearn?.kind === 'target') a.cancelControllerLearn();
    }
    setSelectedLocal(t);
    const tr = preset.tracks[t - 1];
    const badge = destBadge(tr?.dest ?? null);
    setUiSelection({
      controllerTrack: t,
      chip: badge && badge !== '—' ? `T${t} → ${badge}` : `T${t}`,
    });
  };

  // Pick up Rig → Live carry when entering / when chip track changes.
  useEffect(() => {
    if (uiSel.controllerTrack !== selected) {
      setSelectedLocal(uiSel.controllerTrack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiSel.controllerTrack]);

  useEffect(() => {
    try {
      localStorage.setItem('dawlessdaw.ctrlAdvanced', advanced ? '1' : '0');
    } catch {
      // storage unavailable
    }
  }, [advanced]);

  // ⌘Z / Ctrl+Z undo while this tab is open (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        a.undoController();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outputPorts = portsForRoles(snap.assignments);
  const circuitPort = outputPorts.circuitIn;
  const circuitTrack = snap.activeCircuitTrack;
  const knobTrack = circuitTrack ?? selected;
  const knobPage = preset.tracks[knobTrack - 1]!;
  const connected = (d: CtrlDevice) => Boolean(snap.assignments.find((x) => x.roleId === ROLE_OF[d])?.outputPortId);
  const circuitIn = Boolean(snap.assignments.find((x) => x.roleId === 'circuit')?.inputPortId);
  const warnings = controllerWarnings(preset);
  const last = snap.ctrlEvents[0];

  const assignDevice = (t: number, d: CtrlDevice) => {
    const slot = availableSlot(preset, t, d);
    if (slot == null) return;
    a.setControllerTrack(t, { dest: { device: d, slot } });
    setSelected(t);
  };

  return (
    <div className="section-enter controller">
      <div className="page-head">
        <h1>live</h1>
        <span className="readout">
          {circuitIn ? 'Circuit MIDI In assigned' : 'Circuit MIDI In unassigned'}
          {circuitTrack ? (
            <>
              {' '}
              · Live <b>T{circuitTrack}</b>
            </>
          ) : null}
          <>
            {' '}
            · Editing <b>T{selected}</b>
          </>
        </span>
        <button type="button" aria-expanded={checkingRig} aria-controls={checkingRig ? 'circuit-rig-check' : undefined}
          onClick={() => {
            if (checkingRig) setCheckingRig(false);
            else {
              a.checkCircuitRoute(null);
              setCheckingRig(true);
            }
          }}>Check Rig</button>
      </div>
      <LiveTake />
      {checkingRig && <CircuitRigCheck labels={soundLabels} onClose={() => setCheckingRig(false)} />}

      <div className="ctl-layout">
        <div className="panel circuit-face">
          <h2>Circuit lanes</h2>
          <div className="ct-tracks" role="listbox" aria-label="Tracks">
            {preset.tracks.map((tr, i) => {
              const t = i + 1;
              const hit = snap.trackActivity[t] ?? 0;
              const out = songTrackOutputs(snap.routes, snap.ports, circuitPort, t);
              const sent = snap.trackSendActivity[t] ?? 0;
              const destinations = out.map((entry) => {
                const name = entry.portId === outputPorts.mpcOut ? 'MPC' : entry.portId === outputPorts.spOut
                  ? 'SP‑404' : entry.portId === outputPorts.fm1Out ? 'FM1' : entry.name;
                const slot = tr.dest && entry.portId === outputPorts[tr.dest.device === 'sp' ? 'spOut' :
                  tr.dest.device === 'fm1' ? 'fm1Out' : 'mpcOut'] ? slotLabel(tr.dest) : '';
                return `${name}${slot ? ` ${slot}` : ''} · ch ${entry.channel}${entry.connected ? '' : ' · offline'}`;
              });
              const routeLabel = destinations.join(' / ') || (tr.dest ? 'No MIDI output' : 'Off');
              return (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={selected === t}
                  className={`ct-track ${devClass(tr.dest?.device)}${selected === t ? ' selected' : ''}${circuitTrack === t ? ' on-circuit' : ''}${dragOver === t ? ' drag-over' : ''}`}
                  onClick={() => setSelected(t)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(t);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const d = e.dataTransfer.getData('text/x-ctrl-device') as CtrlDevice;
                    if (CTRL_DEVICES.includes(d)) assignDevice(t, d);
                  }}
                >
                  <span key={hit} className={`ct-pad${hit ? ' hit' : ''}`}>
                    T{t}{soundLabels[t] ? ` · ${soundLabels[t]}` : ''}
                  </span>
                  <span className="ct-badge">
                    <span className="ct-channel mono" title={routeLabel}>{routeLabel}</span>
                    <span className="ct-midi-activity" aria-hidden="true">
                      <span key={`in-${hit}`} data-pulse={!!hit} title="MIDI received">IN</span>
                      <span key={`out-${sent}`} data-pulse={!!sent} title="MIDI sent">OUT</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <label className="ctl-sound-label">
            T{selected} sound
            <input key={selected} defaultValue={soundLabels[selected] ?? ''} maxLength={24} placeholder="e.g. Kick"
              onBlur={(event) => {
                const label = event.target.value.trim();
                const next = { ...soundLabels, [selected]: label };
                setSoundLabels(next);
                try { localStorage.setItem(SOUND_LABELS_KEY, JSON.stringify(next)); } catch { /* Session label remains available. */ }
              }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          </label>
          {!checkingRig && <CircuitRouteCheck trackNo={selected} />}
          <div className="ct-knobs">
            {knobPage.knobs.map((slot, k) => {
              const live = snap.lastKnob && snap.lastKnob.track === knobTrack && snap.lastKnob.knob === k ? snap.lastKnob.at : 0;
              return (
                <div key={k} className="ct-knob">
                  <Knob
                    value={snap.knobValues[knobTrack - 1]?.[k] ?? 0}
                    pulse={live}
                    device={slot.target ? (knobPage.dest?.device ?? null) : null}
                    label={`Macro ${k + 1}`}
                  />
                  <span className="ctk-label">{slot.target && knobPage.dest ? slotLabelText(slot) : '—'}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Knobs = <b>T{knobTrack}</b>
            {circuitTrack ? ' (follows hardware).' : ' (follows when you twist).'}
          </p>
          <MoreInfo label="MIDI limits">
            <p className="muted small">
              Mute / scenes / pattern buttons often don&apos;t send MIDI — notes + 8 macros do.
            </p>
            <button
              type="button"
              className={snap.controllerKnobPickup ? 'active' : 'ghost'}
              onClick={() => a.setControllerKnobPickup(!snap.controllerKnobPickup)}
            >
              Soft takeover {snap.controllerKnobPickup ? 'on' : 'off'}
            </button>
          </MoreInfo>
        </div>

        <div className="device-cards">
          <h2 className="dc-heading">2 · Destination</h2>
          {CTRL_DEVICES.map((d) => (
            <div
              key={d}
              className={`dev-card ${devClass(d)}${connected(d) ? '' : ' off'}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/x-ctrl-device', d);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={`Drag onto a track → ${DEVICE_NAME[d]}`}
            >
              <DeviceArt kind={d} lit={connected(d)} pulse={snap.destActivity[d]} className="dev-card-art" />
              <div>
                <strong>{DEVICE_NAME[d]}</strong>
                <span className="dc-status">{connected(d) ? '● MIDI out assigned' : '○ MIDI out unassigned'}</span>
                <span className="dc-blurb">{DEVICE_BLURB[d]}</span>
                <span className="dc-tracks">
                  {preset.tracks
                    .map((tr, i) => (tr.dest?.device === d ? `T${i + 1}` : null))
                    .filter(Boolean)
                    .join(' ') || '—'}
                </span>
              </div>
              <span className="dc-grip" aria-hidden="true">
                ⠿
              </span>
            </div>
          ))}
          <p className="muted small">Drag onto a track, or pick in the panel.</p>
        </div>
      </div>

      <details className="ctl-preset-drawer" open={advanced || undefined}>
        <summary>Routing preset · {preset.name}</summary>
        <PresetBar advanced={advanced} setAdvanced={setAdvanced} />
      </details>

      {warnings.length ? (
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <TrackPanel trackNo={selected} advanced={advanced} />

      {advanced ? (
        <div className="panel">
          <h2>Skiff track channels</h2>
          <p className="muted small">Which MIDI channel each Skiff track listens on (Skiff MENU › MIDI › T1–T6 CHANNEL). Skiff default: track n = channel n.</p>
          <div className="row">
            {preset.skiffChannels.map((ch, i) => (
              <label key={i} className="mono">
                T{i + 1}{' '}
                <select className="select-inline" value={ch} onChange={(e) => a.setSkiffChannel(i + 1, Number(e.target.value))}>
                  {Array.from({ length: 16 }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>
                      ch{n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="live-strip" aria-live="polite">
        <div className={`ls-now ${devClass(last?.device)}`}>{last ? last.text : 'Play or twist — live output here.'}</div>
        <ol className="ls-list">
          {snap.ctrlEvents.slice(1).map((e, i) => (
            <li key={`${e.at}-${i}`} className={devClass(e.device)}>
              {e.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
