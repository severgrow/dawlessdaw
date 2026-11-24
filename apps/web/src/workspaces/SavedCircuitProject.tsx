import { useRef, useState } from 'react';
import { parseNcsSession, type ParsedSession } from '@dawlessdaw/devices';
import { circuitPatternClips, CIRCUIT_RATE_LABELS } from '../arranger/circuitImport';
import { canPlace, loadSong, SONG_BARS, SONG_STORAGE_KEY, SONG_TRACKS } from '../arranger/song';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import './savedCircuitProject.css';

export function SavedCircuitProject({ onUseAsSource }: { onUseAsSource: (patterns: ParsedSession['patterns']) => void }) {
  const { setWorkspace } = useStudioActions();
  const playing = useStudioStore().songPlayingBar != null;
  const [project, setProject] = useState<{ name: string; session: ParsedSession }>();
  const [slots, setSlots] = useState<number[]>(() => SONG_TRACKS.map(() => 0));
  const [cue, setCue] = useState(1);
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState(false);
  const [inspection, setInspection] = useState<{ track: number; step: number }>();
  const fileToken = useRef(0);
  const patterns = project ? SONG_TRACKS.map((_, row) => project.session.patterns[row * 8 + slots[row]!]!) : [];
  const step = inspection && patterns[inspection.track]?.steps[inspection.step];
  const hasNotes = patterns.some((pattern) => pattern.noteCount > 0);

  async function read(file: File) {
    const token = ++fileToken.current;
    setProject(undefined);
    setAdded(false);
    setInspection(undefined);
    setMessage('Opening project…');
    try {
      const session = parseNcsSession(new Uint8Array(await file.arrayBuffer()));
      if (token !== fileToken.current) return;
      setProject({ name: file.name, session });
      setSlots(SONG_TRACKS.map(() => 0));
      setMessage('');
    } catch (error) {
      if (token === fileToken.current) setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function addToSong() {
    try {
      const song = loadSong(localStorage);
      const clips = patterns.flatMap((pattern) => circuitPatternClips(pattern, cue - 1));
      if (!clips.length) {
        setMessage('There are no playable hits inside the selected pattern ranges.');
        return;
      }
      if (clips.some((clip) => !canPlace(song.clips, clip))) {
        setMessage('The import overlaps a clip or extends past bar 32. Choose another start bar.');
        return;
      }
      localStorage.setItem(SONG_STORAGE_KEY, JSON.stringify({ ...song, clips: [...song.clips, ...clips] }));
      setMessage(`Added ${clips.length} MIDI ${clips.length === 1 ? 'clip' : 'clips'} to Song from bar ${cue}.`);
      setAdded(true);
    } catch {
      setMessage('SPLOT could not save the imported clips to Song.');
    }
  }

  return (
    <section className="saved-circuit" aria-label="Saved Circuit project">
      <div className="row cm-actions">
        <label className="seq-field">
          Circuit Rhythm project (.ncs)
          <input type="file" accept=".ncs,application/octet-stream" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
          }} />
        </label>
        {project && <strong>{project.name}</strong>}
      </div>
      <p className="muted small">Open an exported project to see its saved steps. Live playing and unsaved edits appear through performance capture.</p>
      {project && (
        <>
          <div className="saved-circuit-scroll" role="region" aria-label="32-step saved pattern grid" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">Track / pattern</th>{Array.from({ length: 32 }, (_, i) =>
                <th key={i} scope="col" data-beat={i % 4 === 0}>{i + 1}</th>)}</tr></thead>
              <tbody>{patterns.map((pattern, row) => (
                <tr key={row}>
                  <th scope="row">
                    <label>T{row + 1} <select aria-label={`Track ${row + 1} pattern`} value={slots[row]} onChange={(event) => {
                      const value = Number(event.target.value);
                      setSlots((current) => current.map((slot, i) => i === row ? value : slot));
                      setInspection(undefined);
                    }}>
                      {project.session.patterns.slice(row * 8, row * 8 + 8).map((slot) =>
                        <option key={slot.slot} value={slot.pattern}>P{slot.pattern + 1} · {slot.noteCount} hits</option>)}
                    </select></label>
                    <small>{CIRCUIT_RATE_LABELS[pattern.rate & 7]}</small>
                  </th>
                  {pattern.steps.map((cell, index) => (
                    <td key={index} data-beat={index % 4 === 0}
                      data-outside={index < Math.min(pattern.first, pattern.last) || index > Math.max(pattern.first, pattern.last)}>
                      {cell.on && <button type="button"
                        aria-label={`Track ${row + 1}, step ${index + 1}, note ${cell.note}`}
                        aria-pressed={inspection?.track === row && inspection.step === index}
                        onClick={() => setInspection({ track: row, step: index })}>
                        {cell.note}
                      </button>}
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="saved-circuit-detail muted small">
            {step && inspection
              ? `T${inspection.track + 1} · Step ${step.index + 1} · MIDI note ${step.note} · Velocity ${step.velocity} · Gate ${step.gate} microsteps · Hit positions ${step.microHits.map((hit) => hit + 1).join(', ')} · Probability level ${step.probability + 1} of 8${step.tie ? ' · Tie' : ''}`
              : 'Select a hit to inspect its timing and probability. Dimmed steps are outside the saved pattern range.'}
          </p>
          <div className="row cm-actions">
            <label className="seq-field">
              Song start bar
              <select value={cue} onChange={(event) => setCue(Number(event.target.value))}>
                {Array.from({ length: SONG_BARS }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <button className="console-primary" type="button" disabled={!hasNotes || playing} onClick={addToSong}>Add to Song</button>
            {added && <button type="button" onClick={() => setWorkspace('sections')}>Open Song</button>}
            <button type="button" className="seq-btn" disabled={!hasNotes} onClick={() => onUseAsSource(patterns)}>
              Use first 16 steps as source
            </button>
          </div>
          <p className="muted small">Song imports play forward with fixed hits. Chance, ties, sample changes, and knob automation stay on the Circuit. Long patterns may split across clips, with note tails cut at the split. Set Song BPM to match your project.</p>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
