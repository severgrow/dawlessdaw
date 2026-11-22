import {
  CIRCUIT_TRACKS,
  TRACK_DESTS,
  TRACK_DEST_CHANNELS,
  TRACK_PRESETS,
  defaultSendChannel,
  spBankLetter,
  trackPlanWarnings,
  type TrackDestId,
  type TrackSend,
} from '@dawlessdaw/devices';
import { AudioPreview } from '../components/AudioPreview';
import { DeviceArt } from '../components/DeviceArt';
import { RigMap } from '../components/RigMap';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const DEST_LABEL: Record<TrackDestId, string> = { mpc: 'MPC One', sp: 'SP-404MKII', fm1: 'FM1' };
const DEST_ROLE: Record<TrackDestId, 'mpc' | 'sp404' | 'fm1'> = {
  mpc: 'mpc',
  sp: 'sp404',
  fm1: 'fm1',
};

function channelLabel(dest: TrackDestId, ch: number): string {
  if (dest === 'sp') return `bank ${spBankLetter(ch)} · ch${ch}`;
  return `ch${ch}`;
}

/** Flashes when `at` changes (remount restarts the CSS animation). */
function ActivityLed({ at, label }: { at: number; label: string }) {
  return (
    <span
      key={at}
      className={at > 0 ? 'act-led flash' : 'act-led'}
      role="img"
      aria-label={label}
    />
  );
}

function SendCell({ track, dest, send }: { track: number; dest: TrackDestId; send?: TrackSend }) {
  const { setTrackSend } = useStudioActions();
  if (!send) {
    return (
      <button
        type="button"
        className="send-add"
        title={`Send Circuit track ${track} to the ${DEST_LABEL[dest]}`}
        aria-label={`Send track ${track} to ${DEST_LABEL[dest]}`}
        onClick={() => setTrackSend(track, dest, defaultSendChannel(dest, track))}
      >
        +
      </button>
    );
  }
  return (
    <span className="send-chip">
      <select
        value={send.channel}
        aria-label={`Track ${track} to ${DEST_LABEL[dest]} channel`}
        onChange={(e) => setTrackSend(track, dest, Number(e.target.value))}
      >
        {TRACK_DEST_CHANNELS[dest].map((ch) => (
          <option key={ch} value={ch}>
            {channelLabel(dest, ch)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="send-remove"
        aria-label={`Stop sending track ${track} to ${DEST_LABEL[dest]}`}
        title="Stop sending"
        onClick={() => setTrackSend(track, dest, null)}
      >
        ×
      </button>
    </span>
  );
}

export function RigWorkspace() {
  const snap = useStudioStore();
  const {
    applyTrackPreset,
    setClockToMpc,
    setClockToSp,
    setForwardClockToFm1,
    learnSpPadOffset,
    setSpNoteOffset,
    panic,
    setWorkspace,
  } = useStudioActions();

  const plan = snap.trackPlan;
  const warnings = trackPlanWarnings(plan, {
    spNoteOffset: snap.spNoteOffset,
    mpcNoteMode: snap.mpcNoteMode,
  });
  const usesSp = CIRCUIT_TRACKS.some((t) => (plan[t] ?? []).some((s) => s.dest === 'sp'));
  const circuitIn = snap.assignments.find((a) => a.roleId === 'circuit')?.inputPortId;
  const outConnected = (dest: TrackDestId) =>
    Boolean(snap.assignments.find((a) => a.roleId === DEST_ROLE[dest])?.outputPortId);

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>rig</h1>
        <button type="button" className="danger" onClick={() => panic()}>
          Panic · all notes off
        </button>
      </div>
      <p className="lead">
        Choose where each Circuit track plays. Click <strong>+</strong> to send a track to a
        device, pick the channel, <strong>×</strong> to stop. Lights flash when notes go through.
      </p>

      {!circuitIn ? (
        <p className="callout warn-callout">
          No Circuit input yet — plug the Circuit in by USB, or pick its port in{' '}
          <button type="button" className="linklike" onClick={() => setWorkspace('setup')}>
            Setup
          </button>
          .
        </p>
      ) : null}

      <RigMap />

      <AudioPreview />

      <div className="panel">
        <h2>Circuit tracks → devices</h2>
        <div className="row preset-row">
          <span className="muted mono">Presets</span>
          {TRACK_PRESETS.map((p) => (
            <button key={p.id} type="button" className="ghost" title={p.hint} onClick={() => applyTrackPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="route-grid" role="table" aria-label="Circuit track routing">
          <div className="rg-row rg-head" role="row">
            <span role="columnheader">Circuit</span>
            {TRACK_DESTS.map((d) => (
              <span key={d} role="columnheader" className={outConnected(d) ? '' : 'rg-off'}>
                <span className="rg-dev">
                  <DeviceArt
                    kind={d}
                    lit={outConnected(d)}
                    pulse={snap.destActivity[d]}
                    className="rg-art"
                    title={DEST_LABEL[d]}
                  />
                  <span>
                    {DEST_LABEL[d]}
                    {!outConnected(d) ? <span className="rg-missing"> · not connected</span> : null}
                  </span>
                </span>
              </span>
            ))}
          </div>
          {CIRCUIT_TRACKS.map((t) => {
            const sends = plan[t] ?? [];
            return (
              <div key={t} className={`rg-row${sends.length ? '' : ' rg-idle'}`} role="row">
                <span role="rowheader" className="rg-track">
                  <ActivityLed at={snap.trackActivity[t] ?? 0} label={`Track ${t} activity`} />
                  <strong>T{t}</strong>
                  <span className="muted mono">ch{t}</span>
                </span>
                {TRACK_DESTS.map((d) => (
                  <span key={d} role="cell">
                    <SendCell track={t} dest={d} send={sends.find((s) => s.dest === d)} />
                  </span>
                ))}
              </div>
            );
          })}
        </div>

        {warnings.length ? (
          <ul className="warn-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <p className="muted small">
          The Circuit sends track 1–8 on MIDI channels 1–8. Notes and knobs go to the MPC; the SP
          gets notes only (MIDI Mode A: bank A–J = ch1–10); the FM1 gets notes and the Skiff knob
          map ({snap.fm1Firmware === 'skiff' ? 'Skiff' : 'h1: notes only'}). Program changes are
          never passed on.
        </p>
      </div>

      {usesSp ? (
        <div className="panel">
          <h2>SP pads</h2>
          <p className="lead">
            Which Circuit note hits SP pad 1? Press <strong>Learn</strong> and play that note on a
            track sent to the SP. The 15 notes above it play pads 2–16. SP must be in{' '}
            <strong>MIDI Mode A</strong>.
          </p>
          <div className="row">
            <button
              type="button"
              className={snap.learningSpPadOffset ? 'active' : ''}
              onClick={() => learnSpPadOffset()}
            >
              {snap.learningSpPadOffset ? 'Listening… play a note' : 'Learn pad 1'}
            </button>
            <button type="button" onClick={() => setSpNoteOffset(snap.spNoteOffset - 1)} aria-label="Pad 1 note down">
              −
            </button>
            <span className="mono">
              Circuit note {36 - snap.spNoteOffset} = pad 1
            </span>
            <button type="button" onClick={() => setSpNoteOffset(snap.spNoteOffset + 1)} aria-label="Pad 1 note up">
              +
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h2>Tempo · app clock</h2>
        <p className="lead">
          Each switch sends only Circuit <strong>clock / start / stop</strong> to that device. The SP
          already gets clock from the thru box. Circuit Setup: <strong>Clock Tx</strong> (pad 32)
          bright.
        </p>
        <div className="switch-row">
          <button type="button" className={snap.clockToMpc ? 'active' : ''} onClick={() => setClockToMpc(!snap.clockToMpc)}>
            → MPC {snap.clockToMpc ? 'on' : 'off'}
          </button>
          <button type="button" className={snap.clockToSp ? 'active' : ''} onClick={() => setClockToSp(!snap.clockToSp)}>
            → SP {snap.clockToSp ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={snap.forwardClockToFm1 ? 'active' : ''}
            onClick={() => setForwardClockToFm1(!snap.forwardClockToFm1)}
          >
            → FM1 {snap.forwardClockToFm1 ? 'on' : 'off'}
          </button>
        </div>
        {snap.clockToSp ? (
          <p className="warn">SP may get double clock if it&apos;s still on the thru box.</p>
        ) : null}
        {snap.clockToMpc && snap.mpcNoteMode === 'din-only' ? (
          <p className="warn">
            → MPC does nothing while the MPC is set to &quot;MIDI cable from thru box only&quot;
            (Setup).
          </p>
        ) : null}
        <p className="muted mono small">{snap.clockActivity.hint}</p>
      </div>
    </div>
  );
}
