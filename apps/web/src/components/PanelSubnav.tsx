import type { WorkspaceId } from '../studio/runtime';
import { topTabFor, topTabById } from '../nav/tabs';
import { useStudioActions } from '../store/useStudioStore';

/** In-tab pills for grouped panels (Play / Build / Settings). */
export function PanelSubnav({ workspace }: { workspace: WorkspaceId }) {
  const { setWorkspace } = useStudioActions();
  const top = topTabById(topTabFor(workspace));
  if (top.panels.length < 2) return null;

  return (
    <div className="panel-subnav" role="tablist" aria-label={`${top.label} panels`}>
      {top.panels.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={workspace === p.id}
          className={`panel-subnav-btn${workspace === p.id ? ' on' : ''}`}
          onClick={() => setWorkspace(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
