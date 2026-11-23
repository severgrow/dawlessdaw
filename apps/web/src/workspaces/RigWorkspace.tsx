import { destBadge } from '@dawlessdaw/devices';
import { AudioPreview } from '../components/AudioPreview';
import { CircuitTempo } from '../components/CircuitTempo';
import { HowTo } from '../components/HowTo';
import { MoreInfo } from '../components/MoreInfo';
import { RigMap } from '../components/RigMap';
import { WorkspaceErrorBoundary } from '../components/WorkspaceErrorBoundary';
import { carryControllerTrack } from '../nav/uiSelection';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/** Flashes when `at` changes (remount restarts the CSS animation). */
function ActivityLed({ at, label }: { at: number; label: string }) {
  return <span key={at} className={at > 0 ? 'act-led flash' : 'act-led'} role="img" aria-label={label} />;
}

export function RigWorkspace() {
  const snap = useStudioStore();
  const { setClockToMpc, setClockToSp, setForwardClockToFm1, setWorkspace } = useStudioActions();
  const presetName = snap.controllerPresets.find((p) => p.id === snap.controllerSavedId)?.name ?? '—';
  const noteHits = snap.trackActivity.slice(1, 9).filter((t) => t > 0).length;
  const circuitInputId = snap.assignments.find((a) => a.roleId === 'circuit')?.inputPortId;
  const circuitIn = snap.ports.some((port) => port.id === circuitInputId && port.state === 'connected');

  const openController = (track: number) => {
    const tr = snap.controller.tracks[track - 1];
    const badge = destBadge(tr?.dest ?? null);
    carryControllerTrack(track, badge && badge !== '—' ? `T${track} → ${badge}` : `T${track}`);
    setWorkspace('controller');
  };

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>rig</h1>
        <span className={`readout rig-midi-readout${circuitIn ? ' live' : ''}`}>
          {circuitIn ? 'Circuit input connected' : 'Circuit input disconnected'}
          {noteHits > 0 ? (
            <>
              {' '}
              · <b>{noteHits}</b> lit
            </>
          ) : null}
        </span>
        {/* Global Panic lives in the transport strip (Pass B) */}
      </div>
      <HowTo sentence="Tap a device for ports · tap a track to shape it.">
        <p>
          Destinations edit under{' '}
          <button type="button" className="linklike" onClick={() => openController(1)}>
            Live
          </button>
          — Rig stays read-only.
        </p>
      </HowTo>

      <WorkspaceErrorBoundary workspace="Rig art" onReset={() => setWorkspace('rig')}>
        <RigMap />
      </WorkspaceErrorBoundary>

      <div className="panel ct-panel">
        <h2>Tempo</h2>
        <CircuitTempo size="panel" />
        <p className="muted small">
          Tracks lit: <b>{noteHits}</b>
          {snap.anyClockForwarding ? <> · app clock on</> : null}
        </p>
      </div>

      <div className="panel">
        <h2>Tracks</h2>
        <p className="muted small">Tap a track → Live with that track selected.</p>
        <div className="track-summary">
          {snap.controller.tracks.map((tr, i) => {
            const track = i + 1;
            const hit = snap.trackActivity[track] ?? 0;
            const routed = Boolean(tr.dest);
            return (
              <button
                key={i}
                type="button"
                className={`ts-cell ${tr.dest ? `dev-${tr.dest.device}` : 'dev-off'}${routed ? ' ts-routed' : ''}${hit ? ' ts-live' : ''}`}
                onClick={() => openController(track)}
                title={`Shape T${track} in Live`}
              >
                <ActivityLed at={hit} label={`Track ${track} activity`} />
                <b>T{track}</b>
                <span>{destBadge(tr.dest)}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button type="button" onClick={() => openController(1)}>
            Open Live →
          </button>
          <span className="muted small">
            Preset: {presetName}
            {snap.controllerDirty ? ' (changed)' : ''}
          </span>
        </div>
        <MoreInfo>
          <p className="muted small">
            Mixer Level (CC29) → Volume CC7 on each routed out. Program changes never pass on. Lights
            flash on notes, not clock.
          </p>
        </MoreInfo>
      </div>

      <AudioPreview />

      <details className="panel collapsed-chrome">
        <summary>
          <h2>Tempo · sequencer follow</h2>
        </summary>
        <p className="muted small">
          Forwards clock / start / stop only — never notes. → MPC needs Scarlett→DIN.
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
        {snap.clockToSp ? <p className="warn">SP may get double clock if still on the thru box.</p> : null}
        {snap.clockToMpc && snap.mpcNoteMode === 'din-only' ? (
          <p className="warn">→ MPC does nothing while MPC is &quot;thru box only&quot; (Setup).</p>
        ) : null}
        {snap.clockToMpc ? (
          <p className="muted small">
            Checklist:{' '}
            <button type="button" className="linklike" onClick={() => setWorkspace('setup')}>
              Setup › Advanced
            </button>
          </p>
        ) : null}
        <MoreInfo label="Clock details">
          <p className="muted small">
            Song Position forwarded if sent. USB-B on MPC ignores clock. Circuit:{' '}
            <strong>Clock Tx</strong> bright. {snap.clockActivity.hint}
          </p>
        </MoreInfo>
      </details>
    </div>
  );
}
