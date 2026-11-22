/**
 * Circuit Deep Sync — research types only.
 * No claim of live pattern sync unless a probe result is classified as such.
 */

export type ProtocolLane =
  | 'stock-performance-midi'
  | 'stock-file-protocol'
  | 'saved-project-file'
  | 'custom-firmware-protocol';

export type EvidenceTier =
  | 'proven'
  | 'documented-unverified'
  | 'theoretical'
  | 'unsupported';

export type ProbeSafety =
  | 'safe-readonly'
  | 'state-changing-confirm'
  | 'forbidden';

export interface CapabilityRow {
  id: string;
  title: string;
  lane: ProtocolLane;
  tier: EvidenceTier;
  notes: string;
  safety: ProbeSafety;
}

export interface DeepSyncIdentity {
  manufacturerId: number[];
  family: number;
  model: number;
  versionNibbles: number[];
  raw: number[];
  summary: string;
}

export interface CustomFirmwareMarker {
  present: boolean;
  marker: string | null;
  raw: number[] | null;
  lane: ProtocolLane;
}

export interface PatternStep {
  index: number;
  on: boolean;
  note: number;
  gate: number;
  mask: number;
  velocity: number;
  probability: number;
  flip: number;
  tie: boolean;
  /** Microsteps 0–5 with a hit bit in mask (performance vs stored). */
  microHits: number[];
}

export interface PatternAutomationLane {
  index: number;
  /** Raw 192 bytes (32 steps × 6 micro positions); 0xFF = empty. */
  bytes: number[];
  hasData: boolean;
}

export interface ParsedPattern {
  track: number; // 0–7
  pattern: number; // 0–7
  slot: number; // track*8 + pattern
  steps: PatternStep[];
  first: number;
  last: number;
  rate: number;
  dir: number;
  order: number;
  lanes: PatternAutomationLane[];
  noteCount: number;
  empty: boolean;
}

export interface ParsedSession {
  source: 'local-ncs' | 'device-file-read';
  header: string;
  byteLength: number;
  patterns: ParsedPattern[];
  /** Honest label for UI. */
  lane: ProtocolLane;
  disclaimer: string;
}

export interface ProtocolLogEntry {
  at: number;
  direction: 'tx' | 'rx' | 'info' | 'warn' | 'error';
  lane: ProtocolLane | 'bench';
  summary: string;
  data?: number[];
}

export interface RawMidiMonitorEntry {
  at: number;
  portId: string;
  data: number[];
  summary: string;
  /** Performance note stream vs system / sysex. */
  class: 'performance' | 'transport' | 'sysex' | 'other';
}

export interface DeepSyncDiagnosticReport {
  exportedAt: string;
  app: 'dawlessdaw';
  feature: 'circuit-deep-sync';
  enabled: boolean;
  identity: DeepSyncIdentity | null;
  customFirmware: CustomFirmwareMarker | null;
  session: ParsedSession | null;
  protocolLog: ProtocolLogEntry[];
  rawMidiLog: RawMidiMonitorEntry[];
  capabilities: CapabilityRow[];
  honesty: string;
}
