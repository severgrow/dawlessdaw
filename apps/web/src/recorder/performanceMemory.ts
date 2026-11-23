/**
 * App singleton for Performance Memory (Milestone 4).
 * Analysis only — never sends MIDI.
 */
import { PerformanceMemoryEngine } from '@dawlessdaw/sequencer';

let engine: PerformanceMemoryEngine | null = null;

export function getPerformanceMemory(): PerformanceMemoryEngine {
  if (!engine) engine = new PerformanceMemoryEngine();
  return engine;
}
