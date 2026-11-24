import { useEffect, useState } from 'react';
import { CAPTURE_CLOCKS_PER_BAR } from '@dawlessdaw/midi';
import { accentPart } from '../arranger/songParts';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import type { SongPart } from '../arranger/song';

export function SongParts({
  parts, cue, busy, previewing, hasTake, onPlace, onPreview, onStop, onQueue, onSelection, onPlacementFocus, linkedBars, onRename, onSaveVariation, onReplace, onRemove, onGoLive,
}: {
  parts: SongPart[];
  cue: number;
  busy: boolean;
  previewing: boolean;
  hasTake: boolean;
  onSelection: (part: SongPart | undefined) => void;
  onPlacementFocus: (focused: boolean) => void;
  linkedBars: number[];
  onPlace: (part: SongPart, linked: boolean) => void;
  onPreview: (part: SongPart) => boolean;
  onStop: () => void;
  onQueue: (part: SongPart) => void;
  onRename: (part: SongPart, name: string) => void;
  onSaveVariation: (part: SongPart, track: number) => boolean;
  onReplace: (part: SongPart) => void;
  onRemove: (part: SongPart) => void;
  onGoLive: () => void;
}) {
  const [partId, setPartId] = useState<string>();
  const [accentTrack, setAccentTrack] = useState<number>();
  const [editing, setEditing] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [audition, setAudition] = useState<'original' | 'variation'>();
  const [variation, setVariation] = useState<{ part: SongPart; track: number }>();
  const [name, setName] = useState('');
  const auditionLocked = busy && !previewing;
  const part = parts.find((item) => item.id === partId) ?? parts[0];

  useEffect(() => { onSelection(part); }, [part, onSelection]);

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
              <button type="button" key={item.id} aria-pressed={part.id === item.id} disabled={auditionLocked}
                onClick={() => { setPartId(item.id); setAccentTrack(undefined); setEditing(false); setConfirmReplace(false); setVariation(undefined); }}>
                <strong>{item.name}</strong>
                <PartRhythm part={item} />
                <small>{item.length} {item.length === 1 ? 'bar' : 'bars'} · {item.lanes.length} {item.lanes.length === 1 ? 'lane' : 'lanes'} · {item.bpm} BPM</small>
              </button>
            ))}
          </div>
          <div className="song-part-editor">
            <div className="song-controls">
              <button type="button" className="console-primary" disabled={busy} onPointerEnter={() => onPlacementFocus(true)} onPointerLeave={() => onPlacementFocus(false)}
                onFocus={() => onPlacementFocus(true)} onBlur={() => onPlacementFocus(false)} onClick={() => onPlace(part, true)}>Add to bar {cue + 1}</button>
              <button type="button" disabled={busy} onPointerEnter={() => onPlacementFocus(true)} onPointerLeave={() => onPlacementFocus(false)}
                onFocus={() => onPlacementFocus(true)} onBlur={() => onPlacementFocus(false)} onClick={() => onPlace(part, false)}>Place independent copy</button>
              <button type="button" disabled={busy && !previewing} onClick={() => previewing ? onStop() : onPreview(part)}>{previewing ? 'Stop preview' : 'Preview Part'}</button>
              {previewing && !variation && <button type="button" onClick={() => onQueue(part)}>Queue next bar</button>}
            </div>
            <QueuedPart />
            <p>{linkedBars.length
              ? `${linkedBars.length} linked ${linkedBars.length === 1 ? 'placement' : 'placements'} · ${linkedBars.map((bar) => bar + 1).join(', ')}`
              : 'Add creates a linked placement.'}</p>
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
                  setAudition(undefined);
                  setVariation({ part: accentPart(part, lane.track), track: lane.track });
                }}>Make accent variation</button>
                <button type="button" disabled={busy || !hasTake}
                  onClick={() => setConfirmReplace(true)} title="Use the latest take from Live for this Part and every linked placement">
                  Replace with Live take
                </button>
                <button type="button" disabled={busy} onClick={() => { setName(part.name); setEditing(!editing); }}>Rename</button>
                <button type="button" className="danger" disabled={busy}
                  onClick={() => { onRemove(part); setEditing(false); }}>Remove Part</button>
              </div>
              {variation && (
                <div className="song-variation">
                  <p>T{variation.track} · Accent variation</p>
                  <div className="song-controls" role="group" aria-label="Variation audition">
                    <button type="button" disabled={auditionLocked} aria-pressed={previewing && audition === 'original'}
                      onClick={() => { if (onPreview(part)) setAudition('original'); }}>Original</button>
                    <button type="button" disabled={auditionLocked} aria-pressed={previewing && audition === 'variation'}
                      onClick={() => { if (onPreview(variation.part)) setAudition('variation'); }}>Variation</button>
                    <button type="button" disabled={busy} onClick={() => {
                      if (onSaveVariation(variation.part, variation.track)) {
                        setPartId(variation.part.id);
                        setVariation(undefined);
                      }
                    }}>Save variation</button>
                    <button type="button" onClick={() => setVariation(undefined)}>Discard draft</button>
                  </div>
                </div>
              )}
              {confirmReplace && (
                <div className="song-controls">
                  <p>{linkedBars.length ? `Update linked placements at bars ${linkedBars.map((bar) => bar + 1).join(', ')}?` : 'Replace this Part with the latest Live take?'}</p>
                  <button type="button" disabled={busy} onClick={() => { onReplace(part); setConfirmReplace(false); }}>Confirm replace</button>
                  <button type="button" onClick={() => setConfirmReplace(false)}>Cancel</button>
                </div>
              )}
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


function QueuedPart() {
  const name = useStudioStore((s) => s.queuedPartName);
  const { getRuntime } = useStudioActions();
  const runtime = getRuntime();
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!name) return;
    const update = () => setSeconds(runtime.secondsUntilPartSwitch());
    update();
    const timer = setInterval(update, 125);
    return () => clearInterval(timer);
  }, [runtime, name]);
  return name ? (
    <div className="song-controls">
      <span>Next bar · {name} · Current preview tempo{seconds != null ? ` · ${seconds.toFixed(1)}s` : ''}</span>
      <button type="button" onClick={() => runtime.cancelQueuedPart()}>Cancel queued Part</button>
    </div>
  ) : null;
}
