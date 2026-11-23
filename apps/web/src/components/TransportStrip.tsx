import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * Compact transport + status strip shown on every tab.
 * One status line (onboarding / midi) — avoids stacked banners.
 */
export function TransportStrip({ onOpenJam }: { onOpenJam?: () => void }) {
  const snap = useStudioStore();
  const { panic, seqPlay, seqStop, setWorkspace } = useStudioActions();
  const playing = snap.sequencer.playing;
  const bpm = snap.estimatedBpm ?? snap.sequencer.bank.patterns[snap.sequencer.bank.activePatternIndex]?.bpm;
  const status =
    snap.midiError ??
    (snap.onboarding.step !== 'play' ? snap.onboarding.message : snap.statusLine);

  return (
    <div className="transport-strip" role="region" aria-label="Transport">
      <button type="button" className={playing ? 'ts-btn on' : 'ts-btn'} onClick={() => seqPlay()} title="Arm / follow Circuit Play">
        Play
      </button>
      <button type="button" className="ts-btn" onClick={() => seqStop()} title="Stop Splot pattern">
        Stop
      </button>
      <button type="button" className="ts-btn danger" onClick={() => panic()} title="All notes off">
        Panic
      </button>
      {onOpenJam ? (
        <button type="button" className="ts-btn jam" onClick={onOpenJam} title="Jam mode (J)">
          Jam <span className="ts-key">J</span>
        </button>
      ) : null}
      <span className="ts-meta mono small">
        {bpm != null ? `≈ ${bpm} BPM` : '— BPM'}
        {snap.anyClockForwarding ? ' · clock on' : ' · clock off'}
      </span>
      <span className="ts-status" title={status}>
        {status}
      </span>
      {snap.onboarding.step !== 'play' ? (
        <button type="button" className="ts-btn ghost" onClick={() => setWorkspace('setup')}>
          Connect…
        </button>
      ) : null}
    </div>
  );
}
