import { useState } from 'react';
import { DeviceArt, DEVICE_ART_SIZE, type DeviceKind } from './DeviceArt';
import { RigMixerBackdrop } from './RigMixerBackdrop';
import { loadRigBackdropEnabled, saveRigBackdropEnabled } from './mixerOutBus';
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

const PLACES: Record<string, Place> = {
  circuit: { kind: 'circuit', x: 18, y: 110, w: 200, name: 'Circuit Rhythm', sub: 'tracks 1–8' },
  thru: { kind: 'thru', x: 140, y: 310, w: 78, name: 'thru box' },
  mac: { kind: 'mac', x: 335, y: 135, w: 150, name: 'Mac · this app' },
  scarlett: { kind: 'scarlett', x: 568, y: 34, w: 104, name: 'Scarlett 2i4' },
  mpc: { kind: 'mpc', x: 792, y: 6, w: 124, name: 'MPC One' },
  sp: { kind: 'sp', x: 818, y: 148, w: 88, name: 'SP-404MKII' },
  fm1: { kind: 'fm1', x: 760, y: 300, w: 180, name: 'FM1 · Skiff' },
  zed: { kind: 'zed', x: 452, y: 268, w: 104, name: 'ZED-10FX' },
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
  const toggleBackdrop = () => {
    setBackdrop((on) => {
      const next = !on;
      saveRigBackdropEnabled(next);
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
        <button
          type="button"
          className={`rig-backdrop-toggle${backdrop ? ' active' : ''}`}
          aria-pressed={backdrop}
          title="Mixer-out motion behind the map (saved in this browser)"
          onClick={toggleBackdrop}
        >
          Motion {backdrop ? 'on' : 'off'}
        </button>
      </h2>
      <div className={`rig-map${backdrop ? ' with-backdrop' : ''}`} role="group" aria-label="Studio map">
        <RigMixerBackdrop active={backdrop} />
        <svg className="rig-cables" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {/* audio first, under the MIDI */}
          <Cable kind="audio" on d="M840 122 C 760 200, 640 250, 556 286" />
          <Cable kind="audio" on d="M815 262 C 720 280, 640 296, 556 306" />
          <Cable kind="audio" on d="M770 352 C 690 352, 620 330, 556 326" />
          <Cable kind="audio" on d="M470 268 C 460 255, 440 248, 425 240" label="USB audio" lx={398} ly={276} />

          <Cable kind="midi" on={circuitOn} pulse={lastCircuit} d="M228 190 L 335 190" label="USB" lx={281} ly={182} />
          <Cable kind="clock" on d="M120 244 C 120 280, 150 290, 165 300" label="DIN" lx={108} ly={286} />
          <Cable
            kind="clock"
            on
            d="M218 322 C 420 398, 980 398, 960 230 C 955 205, 930 200, 907 205"
            label="clock via thru box"
            lx={560}
            ly={390}
          />
          <Cable
            kind="midi"
            on={mpcOn}
            pulse={snap.destActivity.mpc}
            d="M485 165 C 530 165, 530 61, 568 61"
            label="USB"
            lx={520}
            ly={104}
          />
          <Cable
            kind="midi"
            on={mpcOn}
            pulse={snap.destActivity.mpc}
            d="M672 61 L 792 61"
            label={snap.clockToMpc ? 'DIN · notes+transport' : 'DIN · notes'}
            lx={730}
            ly={84}
          />
          <Cable
            kind="midi"
            on={spOn && (sends('sp') || snap.clockToSp)}
            pulse={snap.destActivity.sp}
            d="M485 195 C 640 195, 700 205, 815 205"
            label="USB"
            lx={650}
            ly={190}
          />
          <Cable
            kind="midi"
            on={fm1On}
            pulse={snap.destActivity.fm1}
            d="M485 222 C 600 222, 640 336, 770 336"
            label={snap.forwardClockToFm1 ? 'USB · notes + clock' : 'USB'}
            lx={700}
            ly={296}
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
