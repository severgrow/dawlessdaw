import { useEffect } from 'react';
import { LAST_TAB_KEY, useStudioActions, useStudioStore } from '../store/useStudioStore';
import { TOP_TABS, topTabFor } from '../nav/tabs';
import {
  digitLabelForTopTabIndex,
  isTypingTarget,
  workspaceForTopTabDigit,
} from '../nav/shortcuts';

/**
 * Horizontal top tabs. Keys **1–N** match visible order (Play=1 … Setup=5).
 * Vertical panel keys live on PanelSubnav (QAZ/WSX/EDC).
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
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const next = workspaceForTopTabDigit(e.key);
      if (!next) return;
      e.preventDefault();
      setWorkspace(next);
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
          title={`${item.label} · ${item.hint} (${digitLabelForTopTabIndex(i)})`}
          onClick={() => {
            if (activeTop === item.id) return;
            setWorkspace(item.defaultPanel);
          }}
        >
          <span className="key nav-key-ghost" aria-hidden="true">
            {digitLabelForTopTabIndex(i)}
          </span>
          <span className="nav-text">
            {item.label}
            <span className="nav-sub">{item.hint}</span>
          </span>
        </button>
      ))}
      <div className="nav-hint">
        {digitLabelForTopTabIndex(0)}–{digitLabelForTopTabIndex(TOP_TABS.length - 1)} tabs
        <br />
        QAZ menu · J jam
      </div>
    </nav>
  );
}
