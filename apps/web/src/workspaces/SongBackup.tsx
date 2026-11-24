import { useRef, useState } from 'react';
import type { Song } from '../arranger/song';
import { readSongBackup, songBackup } from '../arranger/songBackup';

export function SongBackup({ song, busy, onRestore }: {
  song: Song;
  busy: boolean;
  onRestore: (song: Song) => boolean;
}) {
  const [backup, setBackup] = useState<{ name: string; song: Song }>();
  const [error, setError] = useState('');
  const selection = useRef(0);

  function download() {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([songBackup(song)], { type: 'application/json' }));
    link.href = url;
    link.download = 'splot-song-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function open(file: File) {
    const token = ++selection.current;
    setBackup(undefined);
    setError('');
    try {
      const restored = readSongBackup(await file.text());
      if (token === selection.current) setBackup({ name: file.name, song: restored });
    } catch (problem) {
      if (token === selection.current) {
        setError(problem instanceof SyntaxError ? 'This file is not readable JSON.' :
          problem instanceof Error ? problem.message : 'Could not read this backup.');
      }
    }
  }

  return (
    <details className="song-files">
      <summary>Song backup</summary>
      <div className="song-controls">
        <button type="button" onClick={download}>Download backup</button>
        <label>Open backup<input type="file" accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void open(file);
        }} /></label>
      </div>
      {backup && (
        <div className="song-controls">
          <p>{backup.name} · {backup.song.parts?.length ?? 0} Parts · {backup.song.clips.length} clips. Restoring replaces the current Song and Parts. Undo is available after restoring.</p>
          <button type="button" disabled={busy} onClick={() => {
            if (onRestore(backup.song)) setBackup(undefined);
          }}>Restore backup</button>
          <button type="button" onClick={() => { setBackup(undefined); setError(''); }}>Cancel</button>
        </div>
      )}
      {error && <p role="status">{error}</p>}
    </details>
  );
}
