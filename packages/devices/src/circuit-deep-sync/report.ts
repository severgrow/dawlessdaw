import { CIRCUIT_DEEP_SYNC_CAPABILITIES } from './capabilities';
import type {
  CustomFirmwareMarker,
  DeepSyncDiagnosticReport,
  DeepSyncIdentity,
  ParsedSession,
  ProtocolLogEntry,
  RawMidiMonitorEntry,
} from './types';

export function buildDeepSyncReport(input: {
  enabled: boolean;
  identity: DeepSyncIdentity | null;
  customFirmware: CustomFirmwareMarker | null;
  session: ParsedSession | null;
  protocolLog: ProtocolLogEntry[];
  rawMidiLog: RawMidiMonitorEntry[];
}): DeepSyncDiagnosticReport {
  return {
    exportedAt: new Date().toISOString(),
    app: 'dawlessdaw',
    feature: 'circuit-deep-sync',
    enabled: input.enabled,
    identity: input.identity,
    customFirmware: input.customFirmware,
    session: input.session,
    protocolLog: input.protocolLog,
    rawMidiLog: input.rawMidiLog,
    capabilities: [...CIRCUIT_DEEP_SYNC_CAPABILITIES],
    honesty:
      'No bidirectional live pattern sync is claimed. Stock USB MIDI exposes performance events and (via Components-style file protocol) saved project files. Unsaved edits are not observable. Custom firmware proposals are design-only.',
  };
}
