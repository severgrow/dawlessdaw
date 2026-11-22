import type { PortId, RouteId } from '@dawlessdaw/core';

export interface ChannelFilter {
  /** Allowed source channels (1–16). Empty = all. */
  allow?: number[];
  /** Remap source channel → dest channel. */
  remap?: Record<number, number>;
}

export interface NoteRemap {
  /** Map source note → dest note. Unmapped notes pass through. */
  map?: Record<number, number>;
  transpose?: number;
}

export interface VelocityTransform {
  scale?: number; // multiply, then clamp 1–127 (0 stays 0 for note-off)
  offset?: number;
}

export interface CcRemap {
  /** Map CC number → CC number */
  map?: Record<number, number>;
  /** Clamp value range after remap */
  range?: { min: number; max: number };
  /**
   * When true, CCs not listed in `map` are dropped instead of passed through.
   * Used so only translated knob CCs reach a destination (e.g. Circuit macros → Skiff).
   */
  dropUnmapped?: boolean;
  /**
   * Turn one incoming CC (an absolute knob, 0–127) into Program Change on the
   * same (remapped) channel. The knob range is split into `steps` equal zones;
   * zone n sends Program Change n. A PC is only sent when the zone changes, so
   * sweeping the knob never floods the destination.
   */
  toProgramChange?: { controller: number; steps: number };
}

export interface RouteDestination {
  portId: PortId;
  enabled?: boolean;
}

export interface MidiRoute {
  id: RouteId;
  name: string;
  enabled: boolean;
  sourcePortId: PortId;
  destinations: RouteDestination[];
  channel?: ChannelFilter;
  note?: NoteRemap;
  velocity?: VelocityTransform;
  cc?: CcRemap;
  /** When false, clock/transport messages are not forwarded on this route. */
  forwardClock?: boolean;
  /** Exclude these message kinds */
  blockKinds?: string[];
}

export interface RoutingPreset {
  id: string;
  name: string;
  routes: MidiRoute[];
  clockAuthorityPortId: PortId | null;
}

export interface ActiveNoteKey {
  destPortId: PortId;
  channel: number;
  note: number;
}
