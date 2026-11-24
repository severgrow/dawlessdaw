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
  const circuitPlaying = useStudioStore((s) => s.clockHealth.position?.transport === 'playing');
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

  return (
    <section className="live-take" aria-labelledby="live-take-title">
      <div>
        <h2 id="live-take-title">Circuit take</h2>
        <p role="status">{error ?? (looping
          ? 'SPLOT is replaying your take through the current MIDI routes.'
          : take
            ? `${take.length} ${take.length === 1 ? 'bar' : 'bars'} · ${take.song.clips.length} of 8 lanes · ${Math.round(take.song.bpm)} BPM.${circuitPlaying ? ' Stop Circuit before looping.' : ''}`
            : 'Play a phrase on Circuit, then capture the last complete bars.')}</p>
      </div>
      <div className="live-take-actions">
        <label>
          Take length
          <select value={length} disabled={!!playback} onChange={(event) => setLength(Number(event.target.value) as ClipLength)}>
            {CLIP_LENGTHS.map((bars) => <option key={bars} value={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>)}
          </select>
        </label>
        <button type="button" className={take ? '' : 'console-primary'} disabled={!!playback}
          onClick={() => {
            const problem = getRuntime().captureLiveTake(length);
            setError(problem);
            if (!problem) setName('');
          }}>Capture take</button>
        {looping ? (
          <button type="button" className="console-primary" onClick={() => { setError(null); seqStop(); }}>Stop loop</button>
        ) : (
          <button type="button" className={kept ? 'console-primary' : ''} disabled={!take || !!playback}
            onClick={() => setError(getRuntime().loopLiveTake())}>Loop take</button>
        )}
      </div>
      {take && (
        <form className="live-keep-part" onSubmit={(event) => { event.preventDefault(); keepPart(); }}>
          {kept ? <span role="status">Saved to Parts · {saved?.name}</span> : (
            <label>
              Part name
              <input value={name} maxLength={40} placeholder="e.g. Break A"
                onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          {kept
            ? <button type="button" onClick={() => setWorkspace('sections')}>Open Parts in Song</button>
            : <button type="submit" className="console-primary">Keep as Part</button>}
        </form>
      )}
    </section>
  );
}
