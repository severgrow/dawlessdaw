import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CAPTURE_CLOCKS_PER_BAR } from '@dawlessdaw/midi';
import { portsForRoles } from '@dawlessdaw/devices';
import { canPlace, CLIP_LENGTHS, loadSong, sectionClips, SONG_BARS, SONG_STORAGE_KEY, SONG_TRACKS, type ClipLength, type SongClip } from '../arranger/song';
import { songMidi } from '../arranger/songMidi';
import { songTrackOutputs } from '../arranger/songRoutes';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import './songArranger.css';

export function SongArranger() {
  const { getRuntime, seqStop } = useStudioActions();
  const snap = useStudioStore();
  const [song, setSong] = useState(() => loadSong(localStorage));
  const [length, setLength] = useState<ClipLength>(2);
  const [quantize, setQuantize] = useState(false);
  const [looping, setLooping] = useState(false);
  const [cue, setCue] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const mutedTracks = song.mutedTracks ?? [];
  const [feedback, setFeedback] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const selected = song.clips.find((clip) => clip.id === selectedId);
  const pitches = [...new Set(selected?.notes.map((note) => note.pitch))].sort((a, b) => b - a);
  const activeBar = snap.songPlayingBar;
  const playing = activeBar != null;
  const visibleLength = Math.min(length, SONG_BARS - cue);
  const section = useMemo(
    () => cue + length <= SONG_BARS ? sectionClips(song.clips, cue, length) : [],
    [song.clips, cue, length],
  );
  const playableSection = section.filter((clip) => !mutedTracks.includes(clip.track));
  const assigned = portsForRoles(snap.assignments);

  useEffect(() => {
    try {
      localStorage.setItem(SONG_STORAGE_KEY, JSON.stringify(song));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [song]);

  function capture() {
    const take = getRuntime().captureCircuitSong(length, quantize);
    if ('error' in take) {
      setFeedback(take.error);
      return;
    }
    const clips = take.clips.map((clip) => ({ ...clip, id: crypto.randomUUID(), bar: cue }));
    if (clips.some((clip) => !canPlace(song.clips, clip))) {
      setFeedback('The take overlaps a clip or extends past bar 32. Pick another bar on the ruler.');
      return;
    }
    setSong({ ...song, bpm: song.clips.length ? song.bpm : take.bpm, clips: [...song.clips, ...clips] });
    setSelectedId(clips[0]?.id);
    const notes = clips.reduce((sum, clip) => sum + clip.notes.length, 0);
    setFeedback(`Captured ${notes} notes across ${clips.length} of 8 lanes at ${take.bpm} BPM.`);
  }

  function placeClip(clip: SongClip, copy: boolean) {
    const placed = { ...clip, bar: cue, id: copy ? crypto.randomUUID() : clip.id };
    if (!canPlace(song.clips, placed)) {
      setFeedback('That clip overlaps another clip on this lane or extends past bar 32.');
      return;
    }
    setSong({ ...song, clips: [...song.clips.filter((item) => item.id !== placed.id), placed] });
    setSelectedId(placed.id);
    setFeedback(`${copy ? 'Copied' : 'Moved'} T${clip.track} clip to bar ${cue + 1}.`);
  }

  function play(loop = false) {
    const clips = loop ? playableSection : song.clips.filter((clip) => !mutedTracks.includes(clip.track));
    const error = getRuntime().playSong({ ...song, clips }, cue, loop ? length : undefined);
    setLooping(loop && !error);
    setFeedback(error ?? '');
  }

  function duplicateSection() {
    const target = cue + length;
    const clips = section.map((clip) => ({ ...clip, id: crypto.randomUUID(), bar: target }));
    if (clips.some((clip) => !canPlace(song.clips, clip))) {
      setFeedback('The next section overlaps a clip or extends past bar 32.');
      return;
    }
    setSong({ ...song, clips: [...song.clips, ...clips] });
    setSelectedId(clips[0]?.id);
    setCue(target);
    setFeedback(`Duplicated ${length} ${length === 1 ? 'bar' : 'bars'} across ${clips.length} of 8 lanes to bar ${target + 1}.`);
  }

  function exportMidi() {
    const url = URL.createObjectURL(new Blob([songMidi(song)], { type: 'audio/midi' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'splot-song.mid';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('Exported unmuted Song lanes as MIDI channels 1–8.');
  }

  return (
    <section className="song-arranger" aria-labelledby="song-title">
      <header className="song-head">
        <div>
          <h1 id="song-title">Song arranger</h1>
          <p>Play Circuit with Clock Tx and Note Tx on. Let the next bar begin, then capture the last complete bars.</p>
        </div>
        <div className="song-controls">
          <label>
            Section length
            <select value={length} onChange={(e) => setLength(Number(e.target.value) as ClipLength)} disabled={playing}>
              {CLIP_LENGTHS.map((bars) => <option value={bars} key={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>)}
            </select>
          </label>
          <label className="song-quantize">
            <input type="checkbox" checked={quantize} onChange={(event) => setQuantize(event.target.checked)} disabled={playing} />
            Quantize new takes to 1/16
          </label>
          <button type="button" className="console-primary" onClick={capture} disabled={playing || cue + length > SONG_BARS}>Capture to bar {cue + 1}</button>
        </div>
      </header>
      <div className="song-transport">
        <div className="song-controls">
          <button type="button" className="song-play" disabled={playing || song.clips.length === 0} onClick={() => play()}>
            <span className="song-play-glyph" aria-hidden /> Play from bar {cue + 1}
          </button>
          <button type="button" disabled={playing || !playableSection.length}
            onClick={() => play(true)}>Loop section</button>
          <button type="button" disabled={!playing} onClick={() => seqStop()}>■ Stop song</button>
          <label className="song-bpm">
            Song BPM
            <input
              type="number" min="20" max="400" step="0.1" value={song.bpm} disabled={playing}
              onChange={(event) => {
                const bpm = event.target.valueAsNumber;
                if (Number.isFinite(bpm)) setSong({ ...song, bpm });
              }}
              onBlur={() => setSong({ ...song, bpm: Math.min(400, Math.max(20, song.bpm)) })}
            />
          </label>
        </div>
        <span className="song-state">{playing
          ? `${looping ? 'Looping' : 'Playing'} bar ${activeBar + 1}`
          : visibleLength === 1 ? `Section · Bar ${cue + 1}` : `Section · Bars ${cue + 1}–${cue + visibleLength}`}</span>
      </div>
      <div className="song-scroll" tabIndex={0} role="region" aria-label="Eight-track song timeline">
        <div className="song-grid" style={{ '--song-bars': SONG_BARS } as CSSProperties}>
          <span className="song-lane song-grid-label">Circuit lanes</span>
          {Array.from({ length: SONG_BARS }, (_, bar) => (
            <button type="button" key={bar} className={`song-ruler${bar % 4 === 0 ? ' grid-divider' : ''}`} aria-label={`Cue bar ${bar + 1}`}
              aria-pressed={cue === bar} data-section={bar >= cue && bar < cue + length} data-playhead={bar === activeBar} disabled={playing}
              onClick={() => setCue(bar)}>{bar + 1}</button>
          ))}
          {SONG_TRACKS.map((track) => {
            const outs = songTrackOutputs(snap.routes, snap.ports, assigned.circuitIn, track);
            const routeName = (out: typeof outs[number]) => {
              const device = out.portId === assigned.mpcOut ? 'MPC' : out.portId === assigned.spOut ? 'SP‑404' :
                out.portId === assigned.fm1Out ? 'FM1' : out.name;
              return `${device} · ch ${out.channel}${out.connected ? '' : ' · offline'}`;
            };
            const routing = outs.map(routeName).join(' / ') || 'Unrouted';
            const muted = mutedTracks.includes(track);
            return (
              <div className="song-row" key={track} style={{ gridRow: track + 1 }}>
                <div className="song-lane">
                  <div title={routing}><strong className="mono">T{track}</strong><span>{routing}</span></div>
                  <button type="button" aria-label={`Mute track ${track}`} aria-pressed={muted} disabled={playing}
                    onClick={() => setSong({ ...song, mutedTracks: muted ? mutedTracks.filter((item) => item !== track) : [...mutedTracks, track] })}>M</button>
                </div>
                <div className="song-cue" data-playhead={playing} style={{ gridColumn: activeBar != null ? activeBar + 2 : cue + 2 }} />
                {song.clips.filter((clip) => clip.track === track).map((clip) => (
                  <button type="button" key={clip.id} className="song-clip"
                    style={{ gridColumn: `${clip.bar + 2} / span ${clip.length}` }}
                    aria-pressed={selectedId === clip.id}
                    aria-label={`Track ${track}, bar ${clip.bar + 1}, ${clip.length} bars, ${clip.notes.length} notes`}
                    data-muted={muted}
                    onClick={() => setSelectedId(clip.id)}>
                    <span>{clip.length} {clip.length === 1 ? 'bar' : 'bars'}</span>
                    <small>{clip.notes.length} notes</small>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="song-controls song-section-actions">
        <button type="button" disabled={playing || !section.length || cue + length * 2 > SONG_BARS}
          onClick={duplicateSection}>Duplicate section</button>
        <button type="button" disabled={!song.clips.some((clip) => !mutedTracks.includes(clip.track))}
          onClick={exportMidi}>Export MIDI</button>
      </div>
      <div className="song-inspector">
        {selected ? (
          <>
            <span><strong>T{selected.track} · Bar {selected.bar + 1}</strong> · {selected.notes.length} notes</span>
            <div className="song-controls">
              <button type="button" disabled={playing || cue === selected.bar} onClick={() => placeClip(selected, false)}>Move to cue</button>
              <button type="button" disabled={playing || cue === selected.bar} onClick={() => placeClip(selected, true)}>Copy to cue</button>
              <button type="button" className="danger" disabled={playing} onClick={() => {
                setSong({ ...song, clips: song.clips.filter((clip) => clip.id !== selected.id) });
                setSelectedId(undefined);
                setFeedback('Clip deleted.');
              }}>Delete clip</button>
            </div>
          </>
        ) : <span>Select a clip to move, copy or delete it. The ruler sets the cue for capture and playback.</span>}
      </div>
      {selected && (
        <div className="song-note-preview" role="region" aria-label="Selected clip notes by MIDI pitch">
          {pitches.map((pitch) => {
            const span = selected.length * CAPTURE_CLOCKS_PER_BAR;
            return (
              <div key={pitch} className="song-note-row">
                <span title={`MIDI note ${pitch}`}>{pitch}</span>
                <div className="song-note-lane" style={{ '--note-beat': `${100 / (4 * selected.length)}%` } as CSSProperties}>
                  {selected.notes.filter((note) => note.pitch === pitch).map((note, i) => (
                    <span key={i} className="song-note" title={`Note ${pitch} · velocity ${note.velocity}`}
                      style={{ left: `${100 * note.at / span}%`, width: `${100 * (note.end - note.at) / span}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="song-feedback" role="status">{saveFailed ? 'Local save failed. Your clips are only available in this window.' :
        feedback || (activeBar == null && snap.statusLine.startsWith('Song ') ? snap.statusLine :
          'Stop Circuit before playing the Song. Song playback sends MIDI notes through your assigned outputs.')}</p>
      {assigned.mpcOut && <p className="song-hint">On MPC, choose a program for each track, set its MIDI input to the lane’s channel, and set monitoring to In.</p>}
    </section>
  );
}
