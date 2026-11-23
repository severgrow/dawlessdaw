import { useEffect } from 'react';
import {
  LAST_TAB_KEY,
  useStudioActions,
  useStudioStore,
  type WorkspaceId,
} from '../store/useStudioStore';

const ITEMS: { id: WorkspaceId; label: string; hint: string }[] = [
  { id: 'rig', label: 'Rig', hint: 'Map of the studio · listen · tempo' },
  { id: 'controller', label: 'Controller', hint: 'Circuit tracks and knobs → SP, FM1, MPC' },
  { id: 'sequencer', label: 'Sequencer', hint: 'Dawlessdaw 8×16 patterns → same destinations' },
  { id: 'samples', label: 'Samples', hint: 'SP-404 pads: load, trim, save WAVs' },
  { id: 'sections', label: 'Sections', hint: 'Circuit project → SP pattern / MPC sequence' },
  { id: 'sessions', label: 'Sessions', hint: 'Record / trim / export audio takes' },
  { id: 'test', label: 'Test', hint: 'Bench tests with your gear' },
  { id: 'setup', label: 'Setup', hint: 'Ports and device options' },
];


function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function Nav() {
  const workspace = useStudioStore((s) => s.workspace);
  const { setWorkspace } = useStudioActions();

  useEffect(() => {
    try {
      localStorage.setItem(LAST_TAB_KEY, workspace);
    } catch {
      // storage unavailable
    }
  }, [workspace]);

  // Number keys 1–8 switch tabs, like a pad row.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav className="nav" aria-label="Tabs">
      {ITEMS.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={workspace === item.id ? 'active' : ''}
          aria-current={workspace === item.id ? 'page' : undefined}
          title={item.hint}
          onClick={() => setWorkspace(item.id)}
        >
          <span className="key" aria-hidden="true">
            {i + 1}
          </span>
          <span className="nav-text">
            {item.label}
            <span className="nav-sub">{item.hint}</span>
          </span>
        </button>
      ))}
      <div className="nav-hint">keys 1–8</div>
    </nav>
  );
}
