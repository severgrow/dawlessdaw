import { useStudioActions, useStudioStore, type WorkspaceId } from '../store/useStudioStore';

const ITEMS: { id: WorkspaceId; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'patchbay', label: 'Patchbay' },
  { id: 'bridge', label: 'Section Bridge' },
  { id: 'bench', label: 'Bench Test' },
  { id: 'performance', label: 'Performance' },
  { id: 'library', label: 'Library' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'settings', label: 'Settings' },
];

export function Nav() {
  const workspace = useStudioStore((s) => s.workspace);
  const { setWorkspace } = useStudioActions();

  return (
    <nav className="nav" aria-label="Workspaces">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={workspace === item.id ? 'active' : ''}
          onClick={() => setWorkspace(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
