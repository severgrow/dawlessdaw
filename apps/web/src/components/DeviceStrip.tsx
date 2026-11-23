import { MY_STUDIO_ROLES, unmatchedConnectedPorts } from '@dawlessdaw/devices';
import { resolveNextAction } from '../nav/nextAction';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';
import { DeviceArt, type DeviceKind } from './DeviceArt';

const ART: Record<string, DeviceKind> = {
  circuit: 'circuit',
  mpc: 'mpc',
  sp404: 'sp',
  fm1: 'fm1',
  zed: 'zed',
};

function midiStripStatus(
  connected: boolean,
  hasUnmatchedPorts: boolean,
): { label: string; title: string } {
  if (connected) {
    return { label: 'connected', title: 'Role has a Web MIDI port assigned' };
  }
  if (hasUnmatchedPorts) {
    return {
      label: 'unassigned',
      title: 'Ports connected but not assigned — open Connect / Setup',
    };
  }
  return {
    label: 'no port',
    title: 'No Web MIDI port for this role yet',
  };
}

/**
 * Device strip (Pass B). When MIDI/ports missing, collapse to one CTA chip
 * instead of five “NO WEB MIDI PORT” failures. Heavy Setup disclosure = Pass C.
 */
export function DeviceStrip({ onOpenConnect }: { onOpenConnect?: () => void }) {
  const snap = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const customClaimed = Object.values(snap.customBindings ?? {}).flatMap((b) =>
    [b.inputPortId, b.outputPortId].filter((id): id is string => Boolean(id)),
  );
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments, customClaimed);
  const hasUnmatchedPorts = unmatched.length > 0;
  const connectedPorts = snap.ports.filter((p) => p.state === 'connected').length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts,
    onboardingStep: snap.onboarding.step,
  });

  // Pass B: collapse failure dashboard — StatusBar owns the primary CTA.
  if (next.kind === 'allow-midi' || (next.kind === 'assign-ports' && connectedPorts === 0)) {
    return (
      <div className="device-strip device-strip-empty" role="status">
        <button
          type="button"
          className="device-chip device-chip-quiet"
          onClick={() => onOpenConnect?.()}
          title={next.hint}
        >
          <DeviceArt kind="mac" lit={false} pulse={0} className="chip-art" />
          <span className="name">No ports yet</span>
          <span className="meta">Connect</span>
        </button>
      </div>
    );
  }

  return (
    <div className="device-strip" role="list">
      {MY_STUDIO_ROLES.map((role) => {
        const assignment = snap.assignments.find((a) => a.roleId === role.id);
        const connected = Boolean(assignment?.connected);
        const status = role.midi
          ? midiStripStatus(connected, hasUnmatchedPorts)
          : {
              label: 'usb audio',
              title: 'USB audio only — not on MIDI',
            };
        const portName =
          role.id === 'circuit'
            ? assignment?.inputPortName
            : (assignment?.outputPortName ?? assignment?.inputPortName);
        const via =
          connected &&
          portName &&
          !portName.toLowerCase().includes(role.label.split(' ').pop()!.toLowerCase())
            ? `via ${portName}`
            : null;
        return (
          <button
            key={role.id}
            type="button"
            role="listitem"
            className={`device-chip ${role.midi && connected ? '' : 'disconnected'}`}
            onClick={() => setWorkspace('setup')}
            title={
              connected
                ? `${assignment?.inputPortName ?? '—'} in · ${assignment?.outputPortName ?? '—'} out`
                : status.title
            }
          >
            <DeviceArt
              kind={ART[role.id] ?? 'mac'}
              lit={!role.midi || connected}
              pulse={
                role.id === 'circuit'
                  ? Math.max(0, ...snap.trackActivity)
                  : role.id === 'mpc'
                    ? snap.destActivity.mpc
                    : role.id === 'sp404'
                      ? snap.destActivity.sp
                      : role.id === 'fm1'
                        ? snap.destActivity.fm1
                        : 0
              }
              className="chip-art"
            />
            <span className="name">{role.label}</span>
            <span className="meta">{via ?? status.label}</span>
          </button>
        );
      })}
    </div>
  );
}
