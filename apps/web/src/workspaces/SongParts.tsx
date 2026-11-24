import { useState } from 'react';
import { CAPTURE_CLOCKS_PER_BAR } from '@dawlessdaw/midi';
import type { SongPart } from '../arranger/song';

export function SongParts({
  parts, cue, busy, previewing, hasTake, onPlace, onPreview, onRename, onAccent, onReplace, onRemove, onGoLive,
}: {
  parts: SongPart[];
  cue: number;
  busy: boolean;
  previewing: boolean;
  hasTake: boolean;
  onPlace: (part: SongPart, linked: boolean) => void;
  onPreview: (part: SongPart) => void;
  onRename: (part: SongPart, name: string) => void;
  onAccent: (part: SongPart, track: number) => string | void;
  onReplace: (part: SongPart) => void;
  onRemove: (part: SongPart) => void;
  onGoLive: () => void;
}) {
  const [partId, setPartId] = useState<string>();
  const [accentTrack, setAccentTrack] = useState<number>();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const part = parts.find((item) => item.id === partId) ?? parts[0];

  return (
    <section className="song-parts" aria-labelledby="song-parts-title">
      <header>
        <h2 id="song-parts-title">Parts</h2>
        <span className="mono">{parts.length} saved</span>
      </header>
      {!part ? (
        <div className="song-parts-empty">
          <p>Keep a Circuit take in Live to use it anywhere in your Song.</p>
          <button type="button" onClick={onGoLive}>Open Live</button>
        </div>
      ) : (
        <div className="song-parts-body">
          <div className="song-part-list" aria-label="Saved Parts" role="group">
            {parts.map((item) => (
              <button type="button" key={item.id} aria-pressed={part.id === item.id} disabled={previewing}
                onClick={() => { setPartId(item.id); setAccentTrack(undefined); setEditing(false); }}>
                <strong>{item.name}</strong>
                <PartRhythm part={item} />
                <small>{item.length} {item.length === 1 ? 'bar' : 'bars'} · {item.lanes.length} {item.lanes.length === 1 ? 'lane' : 'lanes'} · {item.bpm} BPM</small>
              </button>
            ))}
          </div>
          <div className="song-part-editor">
            <div className="song-controls">
              <button type="button" className="console-primary" disabled={busy} onClick={() => onPlace(part, true)}>Add to bar {cue + 1}</button>
              <button type="button" disabled={busy} onClick={() => onPlace(part, false)}>Place independent copy</button>
              <button type="button" disabled={busy && !previewing} onClick={() => onPreview(part)}>{previewing ? 'Stop preview' : 'Preview Part'}</button>
            </div>
            <p>Linked placements follow this Part. Independent copies can be changed separately.</p>
            <details className="song-part-tools" key={part.id}>
              <summary>Manage Part</summary>
              <div className="song-controls">
                <label>
                  Accent lane
                  <select value={part.lanes.some((lane) => lane.track === accentTrack) ? accentTrack : part.lanes[0]?.track}
                    onChange={(event) => setAccentTrack(Number(event.target.value))} disabled={busy}>
                    {part.lanes.map((lane) => <option key={lane.track} value={lane.track}>T{lane.track}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy} onClick={() => {
                  const lane = part.lanes.find((item) => item.track === accentTrack) ?? part.lanes[0]!;
                  const id = onAccent(part, lane.track);
                  if (id) { setPartId(id); setEditing(false); }
                }}>Make accent variation</button>
                <button type="button" disabled={busy || !hasTake}
                  onClick={() => onReplace(part)} title="Use the latest take from Live for this Part and every linked placement">
                  Replace with Live take
                </button>
                <button type="button" disabled={busy} onClick={() => { setName(part.name); setEditing(!editing); }}>Rename</button>
                <button type="button" className="danger" disabled={busy}
                  onClick={() => { onRemove(part); setEditing(false); }}>Remove Part</button>
              </div>
              {editing && (
                <form className="song-controls" onSubmit={(event) => {
                  event.preventDefault();
                  if (!name.trim()) return;
                  onRename(part, name.trim());
                  setEditing(false);
                }}>
                  <label>New Part name<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
                  <button type="submit" disabled={busy || !name.trim()}>Save name</button>
                </form>
              )}
            </details>
          </div>
        </div>
      )}
    </section>
  );
}


function PartRhythm({ part }: { part: SongPart }) {
  const steps = Array<number>(16).fill(0);
  for (const lane of part.lanes) {
    for (const note of lane.notes) {
      const column = Math.floor(16 * note.at / (part.length * CAPTURE_CLOCKS_PER_BAR));
      steps[column] = Math.max(steps[column] ?? 0, note.velocity);
    }
  }
  return (
    <span className="song-part-rhythm" aria-hidden="true">
      {steps.map((velocity, i) => <i key={i} style={{ opacity: velocity ? .35 + velocity / 200 : .1 }} />)}
    </span>
  );
}
