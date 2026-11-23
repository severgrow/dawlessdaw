import type { WorkspaceId } from '../studio/runtime';

/** Five top-level tabs (Phase 1). Fine-grained WorkspaceId values stay for deep links. */
export type TopTabId = 'play' | 'build' | 'sounds' | 'record' | 'settings';

export const TOP_TABS: {
  id: TopTabId;
  label: string;
  hint: string;
  panels: { id: WorkspaceId; label: string }[];
  defaultPanel: WorkspaceId;
}[] = [
  {
    id: 'play',
    label: 'Play',
    hint: 'Your rig map + live Circuit controller',
    panels: [
      { id: 'rig', label: 'Rig' },
      { id: 'controller', label: 'Live controller' },
    ],
    defaultPanel: 'rig',
  },
  {
    id: 'build',
    label: 'Build',
    hint: 'Splot pattern, Circuit Mirror, song sections',
    panels: [
      { id: 'sequencer', label: 'Splot pattern' },
      { id: 'sections', label: 'Song sections' },
    ],
    defaultPanel: 'sequencer',
  },
  {
    id: 'sounds',
    label: 'Sounds',
    hint: 'SP samples + loop catcher',
    panels: [{ id: 'samples', label: 'SP samples' }],
    defaultPanel: 'samples',
  },
  {
    id: 'record',
    label: 'Record',
    hint: 'Session takes / export',
    panels: [{ id: 'sessions', label: 'Sessions' }],
    defaultPanel: 'sessions',
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Ports, tests, experimental tools',
    panels: [
      { id: 'setup', label: 'Ports & devices' },
      { id: 'test', label: 'Tests' },
    ],
    defaultPanel: 'setup',
  },
];

/** Old 1–8 pad-row shortcuts (and lastTab deep links) → workspace panels. */
export const LEGACY_KEY_PANELS: readonly WorkspaceId[] = [
  'rig',
  'controller',
  'sequencer',
  'samples',
  'sections',
  'sessions',
  'test',
  'setup',
];

export function topTabFor(workspace: WorkspaceId): TopTabId {
  for (const t of TOP_TABS) {
    if (t.panels.some((p) => p.id === workspace)) return t.id;
  }
  return 'play';
}

export function topTabById(id: TopTabId) {
  return TOP_TABS.find((t) => t.id === id)!;
}

const WIZARD_DISMISS_KEY = 'dawlessdaw.connectWizard.dismissed';
const SHOW_MIDI_KEY = 'dawlessdaw.showMidiNumbers';
const EXPERIMENTAL_KEY = 'dawlessdaw.settings.experimental';
const JAM_HINT_KEY = 'dawlessdaw.jam.seen';

export function loadWizardDismissed(): boolean {
  try {
    return localStorage.getItem(WIZARD_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveWizardDismissed(on: boolean): void {
  try {
    localStorage.setItem(WIZARD_DISMISS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadShowMidiNumbers(): boolean {
  try {
    return localStorage.getItem(SHOW_MIDI_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShowMidiNumbers(on: boolean): void {
  try {
    localStorage.setItem(SHOW_MIDI_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadExperimentalUi(): boolean {
  try {
    return localStorage.getItem(EXPERIMENTAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveExperimentalUi(on: boolean): void {
  try {
    localStorage.setItem(EXPERIMENTAL_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadJamSeen(): boolean {
  try {
    return localStorage.getItem(JAM_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveJamSeen(): void {
  try {
    localStorage.setItem(JAM_HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}
