import { useEffect } from 'react';
import type { WorkspaceId } from '../studio/runtime';
import { ContextChip } from './ContextChip';
import { topTabFor, topTabById } from '../nav/tabs';
import {
  isTypingTarget,
  verticalKeyForPanelIndex,
  workspaceForVerticalKey,
} from '../nav/shortcuts';
import { useStudioActions } from '../store/useStudioStore';

/** In-tab pills + vertical keys QAZ / WSX / EDC (column-major). */
export function PanelSubnav({ workspace }: { workspace: WorkspaceId }) {
  const { setWorkspace } = useStudioActions();
  const top = topTabById(topTabFor(workspace));
  const multi = top.panels.length >= 2;

  useEffect(() => {
    if (!multi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const next = workspaceForVerticalKey(e.key, top.id);
      if (!next) return;
      e.preventDefault();
      setWorkspace(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [multi, top.id, setWorkspace]);

  if (!multi) {
    return (
      <div className="panel-subnav-row panel-subnav-row-chip-only">
        <ContextChip />
      </div>
    );
  }

  return (
    <div className="panel-subnav-row">
      <div className="panel-subnav" role="tablist" aria-label={`${top.label} panels`}>
        {top.panels.map((p, i) => {
          const keyLabel = verticalKeyForPanelIndex(i);
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={workspace === p.id}
              className={`panel-subnav-btn${workspace === p.id ? ' on' : ''}`}
              title={keyLabel ? `${p.label} (${keyLabel.toUpperCase()})` : p.label}
              onClick={() => setWorkspace(p.id)}
            >
              {keyLabel ? (
                <span className="panel-subnav-key nav-key-ghost" aria-hidden="true">
                  {keyLabel.toUpperCase()}
                </span>
              ) : null}
              {p.label}
            </button>
          );
        })}
      </div>
      <ContextChip />
    </div>
  );
}
