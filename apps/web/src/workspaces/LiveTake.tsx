import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CLIP_LENGTHS, type ClipLength } from '../arranger/song';
import { editSong, getSongSnapshot, subscribeSong } from '../arranger/songStore';
import { partFromTake } from '../arranger/songParts';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function LiveTake() {
  const { getRuntime, seqStop, setWorkspace } = useStudioActions();
  const take = useStudioStore((s) => s.liveTake);
  const playback = useStudioStore((s) => s.songPlayback);
  const status = useStudioStore((s) => s.statusLine);
  const circuitPlaying = useStudioStore((s) => s.circuitTransportActive);
  const barsReady = useStudioStore((s) => s.captureBarsReady);
  const firstBar = useStudioStore((s) => s.captureFirstBar ?? s.clockHealth.position?.bar ?? 1);
  const previousStatus = useRef(status);
  const [length, setLength] = useState<ClipLength>(4);
  const [error, setError] = useState<string | null>(null);
  const looping = playback?.source === 'take';
  const [name, setName] = useState('');
  const [keptTake, setKeptTake] = useState<typeof take>(null);
  const [savedId, setSavedId] = useState('');
  const { song } = useSyncExternalStore(subscribeSong, getSongSnapshot);
  const saved = song.parts?.find((part) => part.id === savedId);
  const kept = !!take && keptTake === take && !!saved;

  useEffect(() => {
    if (status !== previousStatus.current && status.startsWith('Song stopped')) setError(status);
    previousStatus.current = status;
  }, [status]);

  function keepPart() {
    if (!take || kept) return;
    try {
      const current = getSongSnapshot().song;
      const parts = current.parts ?? [];
      let number = parts.length + 1;
      while (parts.some((part) => part.name === `Take ${number}`)) number++;
      const part = partFromTake(take.song, take.length, name.trim() || `Take ${number}`);
      editSong({ ...current, parts: [part, ...parts] });
      setKeptTake(take);
      setSavedId(part.id);
      setError(null);
    } catch {
      setError('Could not save this Part. Your take is still available to loop.');
    }
  }

  const readiness = barsReady >= length
    ? `${Math.min(4, barsReady)} complete bars available`
    : circuitPlaying ? `${barsReady} of ${length} complete bars · Ready on bar ${firstBar + length}`
      : 'Press Play on Circuit to capture a phrase.';

  return (
    <form className="live-take" aria-labelledby="live-take-title"
      onSubmit={(event) => { event.preventDefault(); keepPart(); }}>
      <h2 id="live-take-title">Circuit take</h2>
      <div className="live-take-actions">
        <div className="live-length" role="group" aria-label="Capture length">
          {CLIP_LENGTHS.map((bars) => (
            <button type="button" key={bars} aria-label={`Capture ${bars} ${bars === 1 ? 'bar' : 'bars'}`}
              aria-pressed={length === bars} disabled={!!playback} onClick={() => setLength(bars)}>{bars}</button>
          ))}
          <span aria-hidden="true">bars</span>
        </div>
        <button type="button" className={take ? '' : 'console-primary'} disabled={!!playback}
          onClick={() => {
            const problem = getRuntime().captureLiveTake(length);
            setError(problem);
            if (!problem) setName('');
          }}>Capture last</button>
        {looping ? (
          <button type="button" className="console-primary" onClick={() => { setError(null); seqStop(); }}>Stop loop</button>
        ) : (
          <button type="button" className={take && !circuitPlaying && !kept ? 'console-primary' : ''}
            disabled={!take || !!playback || circuitPlaying}
            title={circuitPlaying ? 'Stop Circuit before looping the take' : undefined}
            onClick={() => setError(getRuntime().loopLiveTake())}>Loop take</button>
        )}
        {take && (kept ? <button type="button" onClick={() => setWorkspace('sections')}>Open Part in Song</button> : (
          <>
            <input aria-label="Part name" value={name} maxLength={40} placeholder="Part name (optional)"
              onChange={(event) => setName(event.target.value)} />
            <button type="submit" className={circuitPlaying ? 'console-primary' : ''}>Keep as Part</button>
          </>
        ))}
      </div>
      <p role="status">{error ?? (looping ? 'SPLOT is looping the take.' : kept ? `Saved to Parts · ${saved?.name}` :
        take ? `${take.length} ${take.length === 1 ? 'bar' : 'bars'} · ${take.song.clips.length} of 8 lanes · ${Math.round(take.song.bpm)} BPM. ${circuitPlaying ? 'Take ready · Stop Circuit to loop.' : 'Take ready to loop.'} ${circuitPlaying ? readiness : ''}` : readiness)}</p>
    </form>
  );
}
