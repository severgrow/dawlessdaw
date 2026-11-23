/**
 * Circuit Rhythm 64 Project slots — user-chosen names & colours (Phase 2).
 *
 * Project Change is Program Change on channel 16 (PRG v5 / User Guide MIDI appendix):
 * PGM 0–63 instant, 64–127 queued. Slot index here is 1–64.
 */

export const CIRCUIT_PROJECT_SLOT_COUNT = 64;

export interface CircuitProjectSlot {
  /** 1–64 */
  index: number;
  name: string;
  /** CSS colour string chosen by the user */
  colour: string;
}

export const DEFAULT_PROJECT_COLOURS = [
  '#9fdcc2',
  '#7eb8a0',
  '#5b9a84',
  '#e8e1d2',
  '#c4b8a4',
  '#9a2a45',
  '#5b7c99',
  '#888888',
] as const;

export function defaultProjectSlot(index: number): CircuitProjectSlot {
  const i = Math.max(1, Math.min(CIRCUIT_PROJECT_SLOT_COUNT, Math.round(index)));
  return {
    index: i,
    name: `Project ${i}`,
    colour: DEFAULT_PROJECT_COLOURS[(i - 1) % DEFAULT_PROJECT_COLOURS.length]!,
  };
}

export function emptyProjectGrid(): CircuitProjectSlot[] {
  return Array.from({ length: CIRCUIT_PROJECT_SLOT_COUNT }, (_, i) => defaultProjectSlot(i + 1));
}

export function normalizeProjectGrid(raw: unknown): CircuitProjectSlot[] {
  const base = emptyProjectGrid();
  if (!Array.isArray(raw)) return base;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const index = Number(rec.index);
    if (!Number.isFinite(index) || index < 1 || index > CIRCUIT_PROJECT_SLOT_COUNT) continue;
    const slot = base[index - 1]!;
    if (typeof rec.name === 'string' && rec.name.trim()) {
      slot.name = rec.name.trim().slice(0, 40);
    }
    if (typeof rec.colour === 'string' && rec.colour.trim()) {
      slot.colour = rec.colour.trim().slice(0, 32);
    }
  }
  return base;
}

export const CIRCUIT_PROJECTS_STORAGE_KEY = 'dawlessdaw.circuitProjects';
