import { decodeProjectProgramChange, type ProjectChangeKind } from './circuit-rhythm/midi-map';

export interface SectionBridgeRow {
  /** Circuit Project slot 1–64 */
  projectIndex: number;
  /** Optional SP-404 pattern PC value 0–15 (Pattern 1–16) — hardware testing required until bench pass */
  spProgramChange: number | null;
  /** Optional MPC sequence PC value — hardware testing required until bench pass */
  mpcProgramChange: number | null;
  /** Optional Dawlessdaw Studio Scene id */
  sceneId: string | null;
  label?: string;
}

export interface SectionBridgeConfig {
  enabled: boolean;
  rows: SectionBridgeRow[];
}

export interface SectionBridgeAction {
  kind: ProjectChangeKind;
  projectIndex: number;
  spProgramChange: number | null;
  mpcProgramChange: number | null;
  sceneId: string | null;
  /** Raw MIDI bytes to send (never SysEx) */
  outbound: { portRole: 'sp404' | 'mpc'; data: number[] }[];
}

export const DEFAULT_SECTION_BRIDGE: SectionBridgeConfig = {
  enabled: true,
  rows: [
    {
      projectIndex: 1,
      spProgramChange: 0,
      mpcProgramChange: 0,
      sceneId: null,
      label: 'Section A',
    },
    {
      projectIndex: 2,
      spProgramChange: 1,
      mpcProgramChange: 1,
      sceneId: null,
      label: 'Section B',
    },
  ],
};

/**
 * SP-404 pattern Program Change channel (Section Bridge).
 * My Studio no longer USB-routes Circuit T6 notes to SP (T5+T6 → FM1); this
 * channel is only for Bridge / Bench test PC — never 1–8 or 16.
 */
export const SP_PATTERN_PC_CHANNEL = 13;

/**
 * MPC control channel for MIDI Learn mute + Section Bridge sequence PC.
 * Never use 1–8 (thru-box musical channels) or 16 (Circuit Project).
 */
export const MPC_CONTROL_CHANNEL = 15;

/** CC suggested for MPC MIDI Learn → Mixer Mute (user learns this on the MPC). */
export const MPC_MUTE_LEARN_CC = 20;
export const MPC_MUTE_LEARN_CHANNEL = MPC_CONTROL_CHANNEL;

function programChangeStatus(channel: number): number {
  return 0xc0 | ((channel - 1) & 0x0f);
}

/**
 * Resolve a Circuit ch16 Program Change into Section Bridge actions.
 * Instant: PGM 0–63 · Queued: PGM 64–127 (Novation PRG / sync KB).
 *
 * Outbound PCs: SP on ch13, MPC on control ch15 — never on 1–8 or 16
 * (thru box already mirrors Circuit's native channels into MPC/SP DIN).
 */
export function resolveSectionBridge(
  program: number,
  config: SectionBridgeConfig,
): SectionBridgeAction | null {
  if (!config.enabled) return null;
  const decoded = decodeProjectProgramChange(program);
  if (!decoded) return null;
  const row = config.rows.find((r) => r.projectIndex === decoded.projectIndex);
  if (!row) return null;

  const outbound: SectionBridgeAction['outbound'] = [];
  if (row.spProgramChange !== null && row.spProgramChange >= 0) {
    outbound.push({
      portRole: 'sp404',
      data: [programChangeStatus(SP_PATTERN_PC_CHANNEL), row.spProgramChange & 0x7f],
    });
  }
  if (row.mpcProgramChange !== null && row.mpcProgramChange >= 0) {
    outbound.push({
      portRole: 'mpc',
      data: [programChangeStatus(MPC_CONTROL_CHANNEL), row.mpcProgramChange & 0x7f],
    });
  }

  return {
    kind: decoded.kind,
    projectIndex: decoded.projectIndex,
    spProgramChange: row.spProgramChange,
    mpcProgramChange: row.mpcProgramChange,
    sceneId: row.sceneId,
    outbound,
  };
}

/** All Notes Off (CC 123) on channels 1–16 — safe Panic, no SysEx. */
export function buildPanicMessages(): { channel: number; data: number[] }[] {
  const out: { channel: number; data: number[] }[] = [];
  for (let ch = 1; ch <= 16; ch++) {
    out.push({
      channel: ch,
      data: [0xb0 | ((ch - 1) & 0x0f), 123, 0],
    });
    // Also All Sound Off CC 120
    out.push({
      channel: ch,
      data: [0xb0 | ((ch - 1) & 0x0f), 120, 0],
    });
  }
  return out;
}
