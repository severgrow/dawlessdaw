import { useState } from 'react';
import { CLIP_LENGTHS, type ClipLength } from '../arranger/song';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function LiveTake() {
  const { getRuntime, seqStop } = useStudioActions();
  const take = useStudioStore((s) => s.liveTake);
  const playback = useStudioStore((s) => s.songPlayback);
  const status = useStudioStore((s) => s.statusLine);
  const [length, setLength] = useState<ClipLength>(4);
  const [error, setError] = useState<string | null>(null);
  const looping = playback?.source === 'take';

  return (
    <section className="live-take" aria-labelledby="live-take-title">
      <div>
        <h2 id="live-take-title">Circuit take</h2>
        <p role="status">{error ?? (status.startsWith('Song stopped') ? status : looping
          ? 'SPLOT is replaying your take through the current MIDI routes.'
          : take
            ? `${take.length} ${take.length === 1 ? 'bar' : 'bars'} · ${take.song.clips.length} of 8 lanes · ${Math.round(take.song.bpm)} BPM. Stop Circuit before looping.`
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
          onClick={() => setError(getRuntime().captureLiveTake(length))}>Capture take</button>
        {looping ? (
          <button type="button" className="console-primary" onClick={() => { setError(null); seqStop(); }}>Stop loop</button>
        ) : (
          <button type="button" className={take ? 'console-primary' : ''} disabled={!take || !!playback}
            onClick={() => setError(getRuntime().loopLiveTake())}>Loop take</button>
        )}
      </div>
    </section>
  );
}
