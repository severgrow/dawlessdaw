import { useState } from 'react';
import { DeviceArt, DEVICE_ART_SIZE, type DeviceKind } from './DeviceArt';
import { RigMixerBackdrop } from './RigMixerBackdrop';
import {
  loadRigBackdropDrawings,
  loadRigBackdropEnabled,
  saveRigBackdropDrawings,
  saveRigBackdropEnabled,
} from './mixerOutBus';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * The studio as one picture: boxes where they sit, cables for how MIDI and audio
 * travel. MIDI cables (ON colour) flash when notes go through; dashed ALERT colour = audio.
 * Coordinates are in a 1000 × 400 box that scales with the page.
 */

const W = 1000;
const H = 400;

interface Place {
  kind: DeviceKind;
  x: number;
  y: number;
  w: number;
  name: string;
  sub?: string;
}

/** Left → right signal flow: Circuit → Mac → Scarlett/MPC · SP · FM1 (ZED audio bottom). */
const PLACES: Record<string, Place> = {
  circuit: { kind: 'circuit', x: 12, y: 90, w: 190, name: 'Circuit Rhythm', sub: 'tracks 1–8' },
  thru: { kind: 'thru', x: 48, y: 300, w: 72, name: 'thru box' },
  mac: { kind: 'mac', x: 280, y: 120, w: 148, name: 'Mac · Splot', sub: 'this app' },
  scarlett: { kind: 'scarlett', x: 520, y: 18, w: 100, name: 'Scarlett 2i4' },
  mpc: { kind: 'mpc', x: 740, y: 8, w: 120, name: 'MPC One' },
  sp: { kind: 'sp', x: 780, y: 155, w: 90, name: 'SP-404MKII' },
  fm1: { kind: 'fm1', x: 700, y: 295, w: 170, name: 'FM1 · Skiff' },
  zed: { kind: 'zed', x: 420, y: 275, w: 100, name: 'ZED-10FX' },
};

function boxStyle(p: Place) {
  const [vw, vh] = DEVICE_ART_SIZE[p.kind];
  const h = (p.w * vh) / vw;
  return {
    left: `${(p.x / W) * 100}%`,
    top: `${(p.y / H) * 100}%`,
    width: `${(p.w / W) * 100}%`,
    height: `${(h / H) * 100}%`,
  };
}

/** A cable: dim path + an overlay that flashes when `pulse` changes. */
function Cable({
  d,
  kind,
  on,
  pulse,
  label,
  lx,
  ly,
}: {
  d: string;
  kind: 'midi' | 'audio' | 'clock';
  on: boolean;
  pulse?: number;
  label?: string;
  lx?: number;
  ly?: number;
}) {
  return (
    <g className={`cable cable-${kind}${on ? ' on' : ' off'}`}>
      <path d={d} className="cable-base" />
      {on && pulse ? <path key={pulse} d={d} className="cable-hit" /> : null}
      {label && lx != null && ly != null ? (
        <text x={lx} y={ly} className="cable-label" textAnchor="middle">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function RigMap() {
  const snap = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const [backdrop, setBackdrop] = useState(loadRigBackdropEnabled);
  /** Equipment silhouettes behind the map — default off (cleaner). */
  const [drawings, setDrawings] = useState(() => loadRigBackdropDrawings(false));
  const toggleBackdrop = () => {
    setBackdrop((on) => {
      const next = !on;
      saveRigBackdropEnabled(next);
      return next;
    });
  };
  const toggleDrawings = () => {
    setDrawings((on) => {
      const next = !on;
      saveRigBackdropDrawings(next);
      return next;
    });
  };
  const port = (role: string, which: 'in' | 'out') => {
    const a = snap.assignments.find((x) => x.roleId === role);
    return which === 'in' ? a?.inputPortId : a?.outputPortId;
  };
  const sends = (dest: 'mpc' | 'sp' | 'fm1') =>
    Object.values(snap.trackPlan).some((list) => list.some((s) => s.dest === dest));
  const circuitOn = Boolean(port('circuit', 'in'));
  const lastCircuit = Math.max(0, ...snap.trackActivity);
  const mpcOn = Boolean(port('mpc', 'out')) && snap.mpcNoteMode === 'usb';
  const mpcVia = snap.assignments.find((a) => a.roleId === 'mpc')?.outputPortName ?? '';
  const viaScarlett = /scarlett/i.test(mpcVia);
  const spOn = Boolean(port('sp404', 'out'));
  const fm1On = Boolean(port('fm1', 'out'));

  const tag = (on: boolean, clock: boolean, hasSends: boolean) =>
    !on ? 'not connected' : [hasSends ? 'notes' : null, clock ? 'clock' : null].filter(Boolean).join(' + ') || 'idle';

  const devices: { id: string; lit: boolean; pulse?: number; title: string }[] = [
    { id: 'circuit', lit: circuitOn, pulse: lastCircuit, title: circuitOn ? 'Circuit connected' : 'Circuit not connected' },
    { id: 'thru', lit: true, title: 'MIDI thru box: Circuit → SP (clock)' },
    { id: 'mac', lit: snap.midiReady, title: snap.midiReady ? 'This app — MIDI ready' : 'No MIDI access' },
    { id: 'scarlett', lit: viaScarlett && mpcOn, pulse: snap.destActivity.mpc, title: 'Scarlett 2i4 MIDI Out → MPC MIDI In' },
    { id: 'mpc', lit: mpcOn, pulse: snap.destActivity.mpc, title: `MPC One — ${tag(mpcOn, snap.clockToMpc, sends('mpc'))}` },
    { id: 'sp', lit: spOn, pulse: snap.destActivity.sp, title: `SP-404MKII — ${tag(spOn, snap.clockToSp, sends('sp'))}` },
    { id: 'fm1', lit: fm1On, pulse: snap.destActivity.fm1, title: `FM1 — ${tag(fm1On, snap.forwardClockToFm1, sends('fm1'))}` },
    { id: 'zed', lit: true, title: 'ZED-10FX mixer — USB audio to the Mac' },
  ];

  return (
    <div className="panel rig-map-panel">
      <h2 className="rig-map-head">
        <span>Your rig</span>
        <span className="rig-map-toggles">
          <button
            type="button"
            className={`rig-backdrop-toggle${backdrop ? ' active' : ''}`}
            aria-pressed={backdrop}
            title="Soft wash and meter bars behind the map (saved in this browser)"
            onClick={toggleBackdrop}
          >
            Motion {backdrop ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={`rig-backdrop-toggle${drawings ? ' active' : ''}`}
            aria-pressed={drawings}
            disabled={!backdrop}
            title={
              backdrop
                ? 'Big equipment drawings behind the map (saved in this browser). Off = cleaner.'
                : 'Turn Motion on first to show or hide background drawings'
            }
            onClick={toggleDrawings}
          >
            Drawings {drawings ? 'on' : 'off'}
          </button>
        </span>
      </h2>
      <div className={`rig-map${backdrop ? ' with-backdrop' : ''}`} role="group" aria-label="Studio map">
        <RigMixerBackdrop active={backdrop} showDrawings={drawings} />
        <svg className="rig-cables" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {/* audio first, under the MIDI */}
          <Cable kind="audio" on d="M800 120 C 720 190, 600 250, 520 290" />
          <Cable kind="audio" on d="M790 250 C 700 270, 600 295, 520 305" />
          <Cable kind="audio" on d="M740 345 C 660 345, 580 325, 520 320" />
          <Cable kind="audio" on d="M430 275 C 420 255, 410 240, 400 220" label="USB audio" lx={370} ly={268} />

          <Cable kind="midi" on={circuitOn} pulse={lastCircuit} d="M202 175 L 280 175" label="USB" lx={240} ly={166} />
          <Cable kind="clock" on d="M100 230 C 100 270, 90 290, 85 300" label="DIN" lx={70} ly={275} />
          <Cable
            kind="clock"
            on
            d="M120 320 C 380 390, 920 390, 900 230 C 890 200, 860 195, 825 200"
            label="clock via thru"
            lx={520}
            ly={385}
          />
          <Cable
            kind="midi"
            on={mpcOn}
            pulse={snap.destActivity.mpc}
            d="M428 150 C 480 150, 490 55, 520 55"
            label="USB"
            lx={470}
            ly={95}
          />
          <Cable
            kind="midi"
            on={mpcOn}
            pulse={snap.destActivity.mpc}
            d="M620 55 L 740 55"
            label={snap.clockToMpc ? 'DIN · notes+clock' : 'DIN · notes'}
            lx={680}
            ly={42}
          />
          <Cable
            kind="midi"
            on={spOn && (sends('sp') || snap.clockToSp)}
            pulse={snap.destActivity.sp}
            d="M428 185 C 580 185, 680 200, 780 200"
            label="USB"
            lx={620}
            ly={176}
          />
          <Cable
            kind="midi"
            on={fm1On}
            pulse={snap.destActivity.fm1}
            d="M428 210 C 560 220, 620 320, 700 330"
            label={snap.forwardClockToFm1 ? 'USB · notes+clock' : 'USB'}
            lx={600}
            ly={285}
          />
        </svg>

        {devices.map((d) => {
          const p = PLACES[d.id]!;
          return (
            <button
              key={d.id}
              type="button"
              className={`rig-device rig-${d.id}${d.lit ? '' : ' off'}`}
              style={boxStyle(p)}
              title={`${d.title} — click for Setup`}
              onClick={() => setWorkspace('setup')}
            >
              <DeviceArt kind={p.kind} lit={d.lit} pulse={d.pulse} title={p.name} />
              <span className="rig-name">
                {p.name}
                {p.sub ? <em>{p.sub}</em> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="rig-legend">
        <span>
          <i className="lg-midi" /> MIDI (flashes on notes)
        </span>
        <span>
          <i className="lg-clock" /> clock
        </span>
        <span>
          <i className="lg-audio" /> audio
        </span>
        <span>
          <i className="lg-off" /> not connected / not used
        </span>
      </div>
    </div>
  );
}
