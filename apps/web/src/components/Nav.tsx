import { useEffect } from 'react';
import { LAST_TAB_KEY, useStudioActions, useStudioStore } from '../store/useStudioStore';
import { LEGACY_KEY_PANELS, TOP_TABS, topTabFor } from '../nav/tabs';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Five top tabs in the rail. Keys **1–8** still deep-link the old panels
 * (Rig, Controller, Sequencer, …) so smoke + muscle memory keep working.
 * Clicking a top tab opens that group’s default panel.
 */
export function Nav() {
  const workspace = useStudioStore((s) => s.workspace);
  const { setWorkspace } = useStudioActions();
  const activeTop = topTabFor(workspace);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_TAB_KEY, workspace);
    } catch {
      // storage unavailable
    }
  }, [workspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const n = Number.parseInt(e.key, 10);
      const panel = Number.isInteger(n) ? LEGACY_KEY_PANELS[n - 1] : undefined;
      if (panel) {
        e.preventDefault();
        setWorkspace(panel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav className="nav" aria-label="Tabs">
      {TOP_TABS.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={activeTop === item.id ? 'active' : ''}
          aria-current={activeTop === item.id ? 'page' : undefined}
          title={`${item.hint} (keys ${item.panels.map((p) => LEGACY_KEY_PANELS.indexOf(p.id) + 1).join('/')} for panels)`}
          onClick={() => {
            if (activeTop === item.id) return;
            setWorkspace(item.defaultPanel);
          }}
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
      <div className="nav-hint">click 1–5 · keys 1–8 panels · J jam</div>
    </nav>
  );
}
