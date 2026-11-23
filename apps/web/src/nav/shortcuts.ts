/**
 * Keyboard nav (NER-75): horizontal tabs 1–N, vertical menu QAZ/WSX/EDC.
 * Ignores typing / Learn glass. No engine / MIDI side effects.
 */
import type { WorkspaceId } from '../studio/runtime';
import { TOP_TABS, type TopTabId } from './tabs';

/** Column-major vertical menu: left QAZ, mid WSX, right EDC. */
export const VERTICAL_MENU_KEYS = ['q', 'a', 'z', 'w', 's', 'x', 'e', 'd', 'c'] as const;

export type VerticalMenuKey = (typeof VERTICAL_MENU_KEYS)[number];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Don’t steal keys while interacting with MIDI Learn overlay controls.
  if (target.closest('.midi-learn-glass')) return true;
  return false;
}

/** Digit 1–N → top tab index (0-based), or null. */
export function topTabIndexFromDigitKey(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number.parseInt(key, 10) - 1;
  if (i < 0 || i >= TOP_TABS.length) return null;
  return i;
}

export function workspaceForTopTabDigit(key: string): WorkspaceId | null {
  const i = topTabIndexFromDigitKey(key);
  if (i == null) return null;
  return TOP_TABS[i]!.defaultPanel;
}

/** Lowercase letter → panel index within current top tab’s visible panels. */
export function panelIndexFromVerticalKey(key: string): number | null {
  const k = key.length === 1 ? key.toLowerCase() : '';
  const i = (VERTICAL_MENU_KEYS as readonly string[]).indexOf(k);
  return i >= 0 ? i : null;
}

export function workspaceForVerticalKey(
  key: string,
  topTabId: TopTabId,
): WorkspaceId | null {
  const i = panelIndexFromVerticalKey(key);
  if (i == null) return null;
  const top = TOP_TABS.find((t) => t.id === topTabId);
  if (!top) return null;
  const panel = top.panels[i];
  return panel?.id ?? null;
}

export function verticalKeyForPanelIndex(index: number): string | null {
  return VERTICAL_MENU_KEYS[index] ?? null;
}

export function digitLabelForTopTabIndex(index: number): string {
  return String(index + 1);
}
