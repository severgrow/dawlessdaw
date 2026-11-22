import { destBadge } from '@dawlessdaw/devices';
import { AudioPreview } from '../components/AudioPreview';
import { RigMap } from '../components/RigMap';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/** Flashes when `at` changes (remount restarts the CSS animation). */
function ActivityLed({ at, label }: { at: number; label: string }) {
  return <span key={at} className={at > 0 ? 'act-led flash' : 'act-led'} role="img" aria-label={label} />;
}

export function RigWorkspace() {
  const snap = useStudioStore();
  const { setClockToMpc, setClockToSp, setForwardClockToFm1, panic, setWorkspace } = useStudioActions();
  const circuitIn = snap.assignments.find((a) => a.roleId === 'circuit')?.inputPortId;
  const presetName = snap.controllerPresets.find((p) => p.id === snap.controllerSavedId)?.name ?? '—';

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>rig</h1>
        <button type="button" className="danger" onClick={() => panic()}>
          Panic · all notes off
        </button>
      </div>
      <p className="lead">
        Your studio at a glance: what&apos;s connected, what each Circuit track plays, the mixer&apos;s
        sound and tempo. Lights and cables flash when notes go through.
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

      <div className="panel">
        <h2>Circuit tracks</h2>
        <div className="track-summary">
          {snap.controller.tracks.map((tr, i) => (
            <button
              key={i}
              type="button"
              className={`ts-cell ${tr.dest ? `dev-${tr.dest.device}` : 'dev-off'}`}
              onClick={() => setWorkspace('controller')}
              title="Edit in Controller"
            >
              <ActivityLed at={snap.trackActivity[i + 1] ?? 0} label={`Track ${i + 1} activity`} />
              <b>T{i + 1}</b>
              <span>{destBadge(tr.dest)}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" onClick={() => setWorkspace('controller')}>
            Edit in Controller →
          </button>
          <span className="muted small">
            Preset: {presetName}
            {snap.controllerDirty ? ' (changed)' : ''}
          </span>
        </div>
        <p className="muted small">
          Circuit Mixer (▼ macros) Level CC29 → Volume CC7 on each routed out — turn Circuit CC Tx
          on in Setup. Program changes are never passed on.
        </p>
      </div>

      <AudioPreview />

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
        {snap.clockToSp ? <p className="warn">SP may get double clock if it&apos;s still on the thru box.</p> : null}
        {snap.clockToMpc && snap.mpcNoteMode === 'din-only' ? (
          <p className="warn">
            → MPC does nothing while the MPC is set to &quot;MIDI cable from thru box only&quot; (Setup).
          </p>
        ) : null}
        <p className="muted mono small">{snap.clockActivity.hint}</p>
      </div>
    </div>
  );
}
