import { useEffect } from 'react';
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

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function Nav() {
  const workspace = useStudioStore((s) => s.workspace);
  const { setWorkspace } = useStudioActions();

  // Number keys 1–8 jump between workspaces, like a pad row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const n = Number.parseInt(e.key, 10);
      const item = Number.isInteger(n) ? ITEMS[n - 1] : undefined;
      if (item) {
        e.preventDefault();
        setWorkspace(item.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setWorkspace]);

  return (
    <nav className="nav" aria-label="Workspaces">
      <div className="nav-label">workspaces</div>
      {ITEMS.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={workspace === item.id ? 'active' : ''}
          aria-current={workspace === item.id ? 'page' : undefined}
          onClick={() => setWorkspace(item.id)}
        >
          <span className="key" aria-hidden="true">
            {i + 1}
          </span>
          {item.label}
        </button>
      ))}
      <div className="nav-hint">
        press 1–8 to switch
        <br />
        no sysex · no firmware writes
      </div>
    </nav>
  );
}
