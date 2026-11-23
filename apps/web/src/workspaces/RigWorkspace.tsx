import { destBadge } from '@dawlessdaw/devices';
import { AudioPreview } from '../components/AudioPreview';
import { MoreInfo } from '../components/MoreInfo';
import { RigMap } from '../components/RigMap';
import { WorkspaceErrorBoundary } from '../components/WorkspaceErrorBoundary';
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
  const noteHits = snap.trackActivity.slice(1, 9).filter((t) => t > 0).length;
  const showOnboard = snap.onboarding.step !== 'play';

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>rig</h1>
        <button type="button" className="danger" onClick={() => panic()}>
          Panic · all notes off
        </button>
      </div>
      <p className="lead">What&apos;s connected — edit destinations in Controller.</p>

      {showOnboard ? (
        <p className="callout warn-callout">
          <strong>{snap.onboarding.step}</strong> — {snap.onboarding.message}{' '}
          {snap.onboarding.step !== 'play' ? (
            <button type="button" className="linklike" onClick={() => setWorkspace('setup')}>
              Open Setup
            </button>
          ) : null}
        </p>
      ) : null}

      {!circuitIn && !showOnboard ? (
        <p className="callout warn-callout">
          No Circuit input — pick its port in{' '}
          <button type="button" className="linklike" onClick={() => setWorkspace('setup')}>
            Setup
          </button>
          .
        </p>
      ) : null}

      <WorkspaceErrorBoundary workspace="Rig art" onReset={() => setWorkspace('rig')}>
        <RigMap />
      </WorkspaceErrorBoundary>

      <div className="panel">
        <h2>Activity</h2>
        <p className="muted small">
          Tracks lit: <b>{noteHits}</b>
          {snap.estimatedBpm != null ? (
            <>
              {' '}
              · ≈ <b>{snap.estimatedBpm}</b> BPM
            </>
          ) : null}
          {snap.anyClockForwarding ? <> · clock on</> : <> · clock off</>}
        </p>
      </div>

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
        <MoreInfo>
          <p className="muted small">
            Circuit Mixer Level (CC29) → Volume CC7 on each routed out — turn Circuit CC Tx on in
            Setup. Program changes are never passed on. Lights flash on notes, not clock ticks.
          </p>
        </MoreInfo>
      </div>

      <AudioPreview />

      <div className="panel">
        <h2>Tempo · sequencer follow</h2>
        <p className="muted small">
          Forwards Circuit clock / start / stop only — never notes. → MPC = sequencer follows Circuit
          Play (Scarlett→DIN).
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
          <p className="warn">→ MPC does nothing while MPC is &quot;thru box only&quot; (Setup).</p>
        ) : null}
        {snap.clockToMpc ? (
          <p className="muted small">
            Checklist:{' '}
            <button type="button" className="linklike" onClick={() => setWorkspace('setup')}>
              Setup › MPC follows Circuit Play
            </button>
          </p>
        ) : null}
        <MoreInfo label="Clock details">
          <p className="muted small">
            Song Position is forwarded if Circuit sends it. USB-B on the MPC ignores clock — use
            Scarlett→DIN for MPC Out. SP usually already gets clock from the thru box. Circuit:{' '}
            <strong>Clock Tx</strong> (pad 32) bright. {snap.clockActivity.hint}
          </p>
        </MoreInfo>
      </div>
    </div>
  );
}
