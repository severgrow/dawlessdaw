import { useState, useSyncExternalStore } from 'react';
import { CAPTURE_CLOCKS_PER_BAR } from '@dawlessdaw/midi';
import { portsForRoles } from '@dawlessdaw/devices';
import { songTrackOutputs } from '../arranger/songRoutes';
import { getSongSnapshot, subscribeSong } from '../arranger/songStore';
import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { CircuitTempo } from './CircuitTempo';

/**
 * Transport cluster — instrument affordances (Play triangle / Stop square / Panic outline).
 * Circuit tempo is display-only — never toggles app clock forward.
 */
export function TransportStrip({
  onOpenJam,
  onOpenConnect,
  compact = false,
  hideConnect = false,
}: {
  onOpenJam?: () => void;
  onOpenConnect?: () => void;
  compact?: boolean;
  /** When true, do not show Connect (wizard open or StatusBar owns CTA). */
  hideConnect?: boolean;
}) {
  const snap = useStudioStore();
  const { getRuntime, panic, seqPlay, seqStop } = useStudioActions();
  const { song, cue } = useSyncExternalStore(subscribeSong, getSongSnapshot);
  const inSong = snap.workspace === 'sections';
  const inLive = snap.workspace === 'controller';
  const songClips = inSong ? song.clips.filter((clip) => !song.mutedTracks?.includes(clip.track)) : [];
  const songActiveClips = songClips.filter((clip) => clip.notes.some((note) => (clip.bar - cue) * CAPTURE_CLOCKS_PER_BAR + note.at >= 0));
  const circuit = portsForRoles(snap.assignments).circuitIn;
  const songReady = songActiveClips.some((clip) => songTrackOutputs(snap.routes, snap.ports, circuit, clip.track).some((out) => out.connected));
  const [problem, setProblem] = useState<{ workspace: typeof snap.workspace; message: string }>();
  const playLabel = inSong ? 'Play Song' : inLive ? 'Loop take' : 'Play Pattern';
  const playing = snap.sequencer.playing || snap.songPlayback != null;
  const connected = snap.ports.filter((p) => p.state === 'connected').length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts: connected,
    onboardingStep: snap.onboarding.step,
  });

  const showConnect = !hideConnect && next.kind !== 'ready';

  function play() {
    const runtime = getRuntime();
    const error = inSong ? runtime.playSong({ ...song, clips: songClips }, cue)
      : inLive ? runtime.loopLiveTake() : null;
    setProblem(error ? { workspace: snap.workspace, message: error } : undefined);
    if (!inSong && !inLive) seqPlay();
  }

  return (
    <div
      className={`transport-strip${compact ? ' transport-strip--compact' : ''}`}
      role="region"
      aria-label="Transport"
    >
      <div className="ts-cluster" role="group" aria-label="Transport controls">
        <button
          type="button"
          className={`ts-btn ts-play${playing ? ' on' : ''}`}
          onClick={play}
          disabled={playing || (inSong && (!songReady || snap.circuitTransportActive)) || (inLive && (!snap.liveTake || snap.circuitTransportActive))}
          title={inSong ? (snap.circuitTransportActive ? 'Stop Circuit before playing Song' : songReady ? `Play Song from bar ${cue + 1}` : 'Cue a clip and connect its output') :
            inLive ? (snap.circuitTransportActive ? 'Stop Circuit before looping the take' : 'Loop the captured Circuit take') : 'Play SPLOT pattern'}
          aria-label={inLive ? 'Loop live take' : playLabel}
        >
          <span className="ts-glyph" aria-hidden />
          <span className="ts-label">{playLabel}</span>
        </button>
        <button
          type="button"
          className="ts-btn ts-stop"
          onClick={() => { setProblem(undefined); seqStop(); }}
          title="Stop Splot playback"
          aria-label="Stop"
        >
          <span className="ts-glyph" aria-hidden />
          <span className="ts-label ts-stop-caption">Stop</span>
        </button>
        <button
          type="button"
          className="ts-btn ts-panic danger"
          onClick={() => panic()}
          title="All notes off"
        >
          Panic
        </button>
        {onOpenJam ? (
          <button type="button" className="ts-btn ts-jam jam ts-jam-wide" onClick={onOpenJam} title="Jam (J)">
            Jam
          </button>
        ) : null}
      </div>
      <CircuitTempo size="strip" showBarBeat={next.kind === 'ready'} song={inSong ? { bpm: song.bpm, ready: songReady, hasClips: songActiveClips.length > 0, waiting: snap.circuitTransportActive } : undefined} />
      {onOpenJam ? (
        <details className="ts-more">
          <summary aria-label="More transport controls">More</summary>
          <button type="button" onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open');
            onOpenJam();
          }}>Jam</button>
        </details>
      ) : null}
      {problem?.workspace === snap.workspace && !playing && <span role="status" className="transport-problem">{problem.message}</span>}
      {showConnect ? (
        <button
          type="button"
          className="ts-btn ts-connect"
          onClick={() => onOpenConnect?.()}
          title={next.hint || 'Open Connect'}
        >
          {next.cta || 'Connect'}
        </button>
      ) : null}
    </div>
  );
}
