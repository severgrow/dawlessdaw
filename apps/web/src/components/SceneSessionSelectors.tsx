import { useState } from 'react';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function SceneSessionSelectors() {
  const snap = useStudioStore();
  const { recallScene, saveScene } = useStudioActions();
  const [name, setName] = useState('Take');

  return (
    <div className="row" style={{ marginBottom: '1rem' }}>
      <label className="muted mono">
        Scene{' '}
        <select
          className="select-inline"
          value={snap.activeSceneId ?? ''}
          onChange={(e) => e.target.value && recallScene(e.target.value)}
        >
          <option value="">—</option>
          {snap.scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <input
        className="select-inline"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New scene name"
      />
      <button type="button" onClick={() => saveScene(name || 'Untitled')}>
        Save scene
      </button>
      <span className="muted mono">Session: {snap.session.name}</span>
    </div>
  );
}
