import { describe, expect, it } from 'vitest';
import {
  digitLabelForTopTabIndex,
  panelIndexFromVerticalKey,
  topTabIndexFromDigitKey,
  VERTICAL_MENU_KEYS,
  workspaceForTopTabDigit,
  workspaceForVerticalKey,
} from './shortcuts';
import { TOP_TABS } from './tabs';

describe('keyboard nav shortcuts', () => {
  it('maps 1–N to visible top tabs in order', () => {
    expect(TOP_TABS.length).toBeGreaterThanOrEqual(5);
    expect(topTabIndexFromDigitKey('1')).toBe(0);
    expect(workspaceForTopTabDigit('1')).toBe(TOP_TABS[0]!.defaultPanel);
    expect(workspaceForTopTabDigit('5')).toBe(TOP_TABS[4]!.defaultPanel);
    expect(workspaceForTopTabDigit('9')).toBeNull();
    expect(digitLabelForTopTabIndex(0)).toBe('1');
  });

  it('maps QAZ WSX EDC column-major to panel indices', () => {
    expect([...VERTICAL_MENU_KEYS]).toEqual(['q', 'a', 'z', 'w', 's', 'x', 'e', 'd', 'c']);
    expect(panelIndexFromVerticalKey('q')).toBe(0);
    expect(panelIndexFromVerticalKey('A')).toBe(1);
    expect(panelIndexFromVerticalKey('z')).toBe(2);
    expect(panelIndexFromVerticalKey('w')).toBe(3);
    expect(panelIndexFromVerticalKey('c')).toBe(8);
    expect(panelIndexFromVerticalKey('j')).toBeNull();
  });

  it('resolves vertical keys against Play / Build / Setup panels', () => {
    expect(workspaceForVerticalKey('q', 'play')).toBe('rig');
    expect(workspaceForVerticalKey('a', 'play')).toBe('controller');
    expect(workspaceForVerticalKey('z', 'play')).toBeNull(); // only 2 panels
    expect(workspaceForVerticalKey('q', 'build')).toBe('sequencer');
    expect(workspaceForVerticalKey('a', 'build')).toBe('circuit');
    expect(workspaceForVerticalKey('z', 'build')).toBe('sections');
    expect(workspaceForVerticalKey('w', 'settings')).toBe('test');
  });
});
