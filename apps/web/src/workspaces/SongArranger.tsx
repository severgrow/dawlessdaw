import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { CAPTURE_CLOCKS_PER_BAR } from '@dawlessdaw/midi';
import { portsForRoles } from '@dawlessdaw/devices';
import { CLIP_LENGTHS, sectionClips, SONG_BARS, SONG_TRACKS, type ClipLength, type Song, type SongClip, type SongPart } from '../arranger/song';
import { partClips, partFromTake, placePart, placementError, removePart, updatePart } from '../arranger/songParts';
import { editSong, getSongSnapshot, setSongCue, subscribeSong, undoSong } from '../arranger/songStore';
import { SongBackup } from './SongBackup';
import { SongParts } from './SongParts';
import { songMidi } from '../arranger/songMidi';
import { songTrackOutputs } from '../arranger/songRoutes';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import './songArranger.css';

export function SongArranger() {
  const { getRuntime, seqStop, setWorkspace } = useStudioActions();
  const snap = useStudioStore();
  const { song, cue, canUndo, canRedo } = useSyncExternalStore(subscribeSong, getSongSnapshot);
  const [partsOpen, setPartsOpen] = useState(() => !matchMedia('(max-width: 1040px)').matches);
  const [fit, setFit] = useState(false);
  const [follow, setFollow] = useState(false);
  const [drag, setDrag] = useState<{ id: string; bar: number }>();
  const [selectedPart, setSelectedPart] = useState<SongPart>();
  const [hoverPlacement, setHoverPlacement] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | undefined>(undefined);
  const [length, setLength] = useState<ClipLength>(2);
  const [quantize, setQuantize] = useState(false);
  const [tempoDraft, setTempoDraft] = useState<string>();

  const [selectedId, setSelectedId] = useState<string>();
  const mutedTracks = song.mutedTracks ?? [];
  const [feedback, setFeedback] = useState('');
  const selected = song.clips.find((clip) => clip.id === selectedId);
  const pitches = [...new Set(selected?.notes.map((note) => note.pitch))].sort((a, b) => b - a);
  const playing = snap.songPlayback != null;
  const previewing = snap.songPlayback?.source === 'part';
  const activeBar = snap.songPlayback?.source === 'song' || snap.songPlayback?.source === 'song-loop'
    ? snap.songPlayingBar : null;
  const visibleLength = Math.min(length, SONG_BARS - cue);
  const section = useMemo(
    () => cue + length <= SONG_BARS ? sectionClips(song.clips, cue, length) : [],
    [song.clips, cue, length],
  );
  const playableSection = section.filter((clip) => !mutedTracks.includes(clip.track));
  const assigned = portsForRoles(snap.assignments);
  const lastBar = Math.max(cue + length, ...song.clips.map((clip) => clip.bar + clip.length));
  const barsShown = fit ? Math.max(8, Math.min(SONG_BARS, Math.ceil(lastBar / 4) * 4)) : SONG_BARS;
  const draggedClip = song.clips.find((clip) => clip.id === drag?.id);
  const moved = draggedClip && drag ? movePlan(draggedClip, drag.bar, false) : null;
  const placement = moved?.placed ?? (hoverPlacement && selectedPart ? selectedPart.lanes.map((lane) => ({
    id: `preview-${lane.track}`, track: lane.track, bar: cue, length: selectedPart.length, notes: lane.notes,
  })) : []);
  const blocked = moved?.error ?? placementError(song.clips, moved ? [] : placement);
  const previewBars = activeBar != null && snap.songPlayback?.source === 'song-loop';

  useEffect(() => {
    const media = matchMedia('(max-width: 1040px)');
    const resize = () => setPartsOpen(!media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    if (!follow || activeBar == null || !scroll.current) return;
    const scroller = scroll.current;
    const ruler = scroller.querySelector(`[data-song-bar="${activeBar}"]`)?.getBoundingClientRect();
    const gutter = scroller.querySelector('.song-grid-label')?.getBoundingClientRect().width ?? 0;
    const bounds = scroller.getBoundingClientRect();
    if (ruler && (ruler.right > bounds.right || ruler.left < bounds.left + gutter)) {
      scroller.scrollLeft += ruler.left - bounds.left - gutter;
    }
  }, [activeBar, follow]);

  const showPlayhead = activeBar != null;
  const runtime = getRuntime();
  useEffect(() => {
    const timeline = scroll.current;
    if (!timeline || !showPlayhead) return;
    let next = 0;
    let last = -Infinity;
    const tick = (now: number) => {
      if (now - last >= 30) {
        timeline.style.setProperty('--song-playhead-subbar', String(runtime.songPlayheadFraction()));
        last = now;
      }
      next = requestAnimationFrame(tick);
    };
    next = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(next);
      timeline.style.removeProperty('--song-playhead-subbar');
    };
  }, [runtime, showPlayhead]);

  function commit(next: Song, message = '', select?: string): boolean {
    try {
      editSong(next);
      if (select !== undefined) setSelectedId(select);
      setFeedback(message);
      return true;
    } catch {
      setFeedback('Could not save your changes. Your saved Song is still available.');
      return false;
    }
  }

  function history(redo: boolean) {
    try {
      undoSong(redo);
      setSelectedId(undefined);
      setFeedback(redo ? 'Change restored.' : 'Change undone.');
    } catch {
      setFeedback('Could not save your changes. Your saved Song is still available.');
    }
  }

  function addPart(part: SongPart, linked: boolean) {
    const result = placePart(song, part, cue, linked);
    if ('error' in result) return setFeedback(result.error);
    if (commit(result.song, `Placed ${part.name} at bar ${cue + 1}.`, result.clips[0]?.id)) setLength(part.length);
  }

  function previewPart(part: SongPart) {
    const problem = getRuntime().playSong({ bpm: part.bpm, clips: partClips(part, 0, false) }, 0, part.length, 'part');
    setFeedback(problem ?? '');
    return problem == null;
  }

  function replacePart(part: SongPart, withTake: boolean, name = part.name) {
    const take = snap.liveTake;
    if (withTake && !take) return;
    const replacement = withTake && take
      ? { ...partFromTake(take.song, take.length, name), id: part.id } : { ...part, name };
    const result = updatePart(song, replacement);
    if ('error' in result) return setFeedback(result.error);
    commit(result.song, withTake ? `Replaced ${part.name} and updated its linked placements.` : `Renamed Part to ${name}.`);
  }

  function capture() {
    const take = getRuntime().captureCircuitSong(length, quantize);
    if ('error' in take) {
      setFeedback(take.error);
      return;
    }
    const clips = take.clips.map((clip) => ({ ...clip, id: crypto.randomUUID(), bar: cue }));
    const error = placementError(song.clips, clips);
    if (error) return setFeedback(error);
    const notes = clips.reduce((sum, clip) => sum + clip.notes.length, 0);
    commit({ ...song, bpm: song.clips.length ? song.bpm : take.bpm, clips: [...song.clips, ...clips] },
      `Captured ${notes} notes across ${clips.length} of 8 lanes at ${take.bpm} BPM.`, clips[0]?.id);
  }

  function placementFor(clip: SongClip) {
    return clip.partId ? song.clips.filter((item) => item.bar === clip.bar && item.partId === clip.partId) : [clip];
  }

  function movePlan(clip: SongClip, bar: number, copy: boolean) {
    const selection = placementFor(clip);
    const existing = copy ? song.clips : song.clips.filter((item) => !selection.includes(item));
    const placed = selection.map((item) => copy
      ? { ...item, bar, id: crypto.randomUUID(), partId: undefined }
      : { ...item, bar });
    return { existing, placed, error: placementError(existing, placed) };
  }

  function placeClip(clip: SongClip, copy: boolean, bar = cue) {
    if (!copy && bar === clip.bar) return;
    const { existing, placed, error } = movePlan(clip, bar, copy);
    if (error) return setFeedback(error);
    if (commit({ ...song, clips: [...existing, ...placed] },
      `${copy ? 'Copied' : 'Moved'} ${clip.title ?? `T${clip.track} clip`} to bar ${bar + 1}.`,
      placed.find((item) => item.track === clip.track)?.id)) setSongCue(bar);
  }

  function barAt(clientX: number): number | null {
    const first = scroll.current?.querySelector('[data-song-bar="0"]')?.getBoundingClientRect();
    const gutter = scroll.current?.querySelector('.song-grid-label')?.getBoundingClientRect();
    if (!first || !gutter || clientX < gutter.right) return null;
    return Math.min(barsShown - 1, Math.max(0, Math.floor((clientX - first.left) / first.width)));
  }

  function play(loop = false) {
    const clips = loop ? playableSection : song.clips.filter((clip) => !mutedTracks.includes(clip.track));
    const error = getRuntime().playSong({ ...song, clips }, cue, loop ? length : undefined);
    setFeedback(error ?? '');
  }

  function duplicateSection() {
    const target = cue + length;
    const clips = section.map((clip) => ({ ...clip, id: crypto.randomUUID(), bar: target }));
    const error = placementError(song.clips, clips);
    if (error) return setFeedback(error);
    if (commit({ ...song, clips: [...song.clips, ...clips] },
      `Duplicated ${length} ${length === 1 ? 'bar' : 'bars'} across ${clips.length} of 8 lanes to bar ${target + 1}.`, clips[0]?.id)) setSongCue(target);
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
          <p>Cue a bar to place a saved Part or capture directly from Circuit.</p>
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
          <button type="button" className={song.parts?.length ? '' : 'console-primary'} onClick={capture} disabled={playing || cue + length > SONG_BARS}>Capture to bar {cue + 1}</button>
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
              type="number" min="20" max="400" step="0.1" value={tempoDraft ?? song.bpm} disabled={playing}
              onChange={(event) => setTempoDraft(event.target.value)}
              onBlur={(event) => {
                const value = event.target.valueAsNumber;
                const bpm = Math.min(400, Math.max(20, value));
                if (Number.isFinite(bpm) && bpm !== song.bpm) commit({ ...song, bpm });
                setTempoDraft(undefined);
              }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            />
          </label>
        </div>
        <span className="song-state">{activeBar != null
          ? `${snap.songPlayback?.source === 'song-loop' ? 'Looping' : 'Playing'} bar ${activeBar + 1}`
          : previewing ? 'Previewing Part' : playing ? 'Live take looping' : visibleLength === 1 ? `Section · Bar ${cue + 1}` : `Section · Bars ${cue + 1}–${cue + visibleLength}`}</span>
      </div>
      <p className="song-feedback" role="status">{feedback ||
        (activeBar == null && snap.statusLine.startsWith('Song ') ? snap.statusLine : '')}</p>
      <div className="song-controls song-section-actions">
        <button type="button" disabled={playing || !canUndo} onClick={() => history(false)}>Undo</button>
        <button type="button" disabled={playing || !canRedo} onClick={() => history(true)}>Redo</button>
        <button type="button" disabled={playing || !section.length || cue + length * 2 > SONG_BARS}
          onClick={duplicateSection}>Duplicate section</button>
        <button type="button" disabled={!song.clips.some((clip) => !mutedTracks.includes(clip.track))}
          onClick={exportMidi}>Export MIDI</button>
      </div>
      <div className="song-workbench" data-parts={partsOpen ? 'open' : 'closed'}>
        <div className="song-parts-column">
          <button type="button" className="song-parts-toggle"
            onClick={() => setPartsOpen(!partsOpen)}
            aria-controls="song-parts-column" aria-expanded={partsOpen}>
            {partsOpen ? 'Hide Parts' : 'Parts'} · {song.parts?.length ?? 0}
          </button>
          <div id="song-parts-column" className="song-parts-content">
            <SongParts parts={song.parts ?? []} cue={cue} busy={playing} previewing={previewing} hasTake={!!snap.liveTake}
              onPlace={addPart} onPreview={previewPart}
              onStop={() => { seqStop(); setFeedback(''); }}
              onQueue={(part) => setFeedback(getRuntime().queuePart({ bpm: part.bpm, clips: partClips(part, 0, false) }, part.length, part.name) ?? '')}
              onSelection={setSelectedPart} onPlacementFocus={setHoverPlacement}
              linkedBars={selectedPart ? [...new Set(song.clips.filter((clip) => clip.partId === selectedPart.id).map((clip) => clip.bar))].sort((a, b) => a - b) : []} onRename={(part, name) => replacePart(part, false, name)}
              onSaveVariation={(variation, track) =>
                commit({ ...song, parts: [variation, ...(song.parts ?? [])] }, `Saved accent variation on T${track}.`)}
              onReplace={(part) => replacePart(part, true)}
              onRemove={(part) => commit(removePart(song, part), `Removed ${part.name} from Parts. Its Song clips are now independent.`)}
              onGoLive={() => setWorkspace('controller')} />
          </div>
        </div>
        <div className="song-timeline-column">
          <div className="song-view-controls">
            <button type="button" aria-pressed={fit} onClick={() => setFit(!fit)}>Fit Song</button>
            <button type="button" aria-pressed={follow} onClick={() => setFollow(!follow)}>Follow playhead</button>
          </div>
          <div className="song-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Eight-track song timeline"
            onDragOver={(event) => {
              const id = dragId.current;
              const bar = barAt(event.clientX);
              if (!id || bar == null || playing) return;
              event.preventDefault();
              setDrag((current) => current?.id === id && current.bar === bar ? current : { id, bar });
            }}
            onDrop={(event) => {
              const bar = barAt(event.clientX);
              const clip = song.clips.find((item) => item.id === dragId.current);
              if (clip && bar != null && !playing) {
                event.preventDefault();
                placeClip(clip, false, bar);
              }
              setDrag(undefined);
              dragId.current = undefined;
            }}>
            <div className="song-grid" data-fit={fit} style={{ '--song-bars': barsShown } as CSSProperties}>
              <span className="song-lane song-grid-label">Circuit lanes</span>
              {Array.from({ length: barsShown }, (_, bar) => (
                <button type="button" key={bar} className={`song-ruler${bar % 4 === 0 ? ' grid-divider' : ''}`} aria-label={`Cue bar ${bar + 1}`}
                  aria-pressed={cue === bar} data-song-bar={bar} data-loop={previewBars && bar >= cue && bar < cue + length} data-section={bar >= cue && bar < cue + length} data-playhead={bar === activeBar} disabled={playing}
                  onClick={() => setSongCue(bar)}>{bar + 1}</button>
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
                        onClick={() => commit({ ...song, mutedTracks: muted ? mutedTracks.filter((item) => item !== track) : [...mutedTracks, track] })}>M</button>
                    </div>
                    {placement.filter((clip) => clip.track === track && clip.bar < barsShown).map((clip) => (
                      <div key={clip.id} className="song-placement-preview" data-blocked={!!blocked}
                        style={{ gridColumn: `${clip.bar + 2} / span ${Math.min(clip.length, barsShown - clip.bar)}` }} />
                    ))}
                    <div className="song-cue" style={{ gridColumn: cue + 2 }} />
                    {activeBar != null && <div className="song-playhead" style={{ gridColumn: activeBar + 2 }} />}
                    {song.clips.filter((clip) => clip.track === track).map((clip) => (
                      <button type="button" key={clip.id} className="song-clip"
                        style={{ gridColumn: `${clip.bar + 2} / span ${clip.length}` }}
                        aria-pressed={selectedId === clip.id}
                        aria-label={`${clip.title ? `${clip.title}, ` : ''}Track ${track}, bar ${clip.bar + 1}, ${clip.length} bars, ${clip.notes.length} notes`}
                        data-muted={muted}
                        data-linked={!!clip.partId}
                        draggable={!playing}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', clip.id);
                          event.dataTransfer.effectAllowed = 'move';
                          dragId.current = clip.id;
                        }}
                        onDragEnd={() => { dragId.current = undefined; setDrag(undefined); }}
                        onClick={() => setSelectedId(clip.id)}>
                        <span>{clip.title ?? `${clip.length} ${clip.length === 1 ? 'bar' : 'bars'}`}</span>
                        <small>{clip.partId ? '↔ Linked · ' : ''}{clip.notes.length} notes</small>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          {blocked && placement.length > 0 && <p className="song-placement-warning" role="status">{blocked}</p>}
          <div className="song-inspector">
            {selected ? (
              <>
                <span><strong>{selected.title ? `${selected.title} · ` : ''}T{selected.track} · Bar {selected.bar + 1}</strong> · {selected.notes.length} notes</span>
                <div className="song-controls">
                  <button type="button" disabled={playing || cue === selected.bar} onClick={() => placeClip(selected, false)}>{selected.partId ? 'Move Part to cue' : 'Move to cue'}</button>
                  <button type="button" disabled={playing || cue === selected.bar} onClick={() => placeClip(selected, true)}>{selected.partId ? 'Copy Part to cue' : 'Copy to cue'}</button>
                  <button type="button" className="danger" disabled={playing} onClick={() => {
                    const placement = placementFor(selected);
                    commit({ ...song, clips: song.clips.filter((clip) => !placement.includes(clip)) },
                      selected.partId ? 'Part placement removed.' : 'Clip deleted.', '');
                  }}>{selected.partId ? 'Remove placement' : 'Delete clip'}</button>
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
        </div>
      </div>
      <SongBackup song={song} busy={playing} onRestore={(backup) => commit(backup, 'Backup restored.', '')} />
      {assigned.mpcOut && <p className="song-hint">On MPC, choose a program for each track, set its MIDI input to the lane’s channel, and set monitoring to In.</p>}
    </section>
  );
}
