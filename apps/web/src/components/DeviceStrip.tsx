import { MY_STUDIO_ROLES, unmatchedConnectedPorts } from '@dawlessdaw/devices';
import { resolveNextAction } from '../nav/nextAction';
import { carrySetupRole, useUiSelection } from '../nav/uiSelection';
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
 * Device strip (Pass B/C). Empty → one quiet chip. Assigned → chips with
 * activity pulse; click carries role into Setup Ports.
 */
export function DeviceStrip() {
  const snap = useStudioStore();
  const sel = useUiSelection();
  const { setWorkspace } = useStudioActions();
  const customClaimed = Object.values(snap.customBindings ?? {}).flatMap((b) =>
    [b.inputPortId, b.outputPortId].filter((id): id is string => Boolean(id)),
  );
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments, customClaimed);
  const hasUnmatchedPorts = unmatched.length > 0;
  const connectedPorts = snap.ports.filter((p) => p.state === 'connected').length;
  const assignedMidi = snap.assignments.filter((a) => a.connected).length;
  const next = resolveNextAction({
    midiReady: snap.midiReady,
    midiError: snap.midiError,
    connectedPorts,
    onboardingStep: snap.onboarding.step,
  });

  // v3: never render an empty chrome row — Connect / Setup own the CTA.
  if (next.kind === 'allow-midi' || (next.kind === 'assign-ports' && connectedPorts === 0)) {
    return null;
  }

  // Ports exist but nothing assigned — still not a chrome toolbar (Setup owns it).
  if (assignedMidi === 0 && hasUnmatchedPorts) {
    return null;
  }

  if (assignedMidi === 0) {
    return null;
  }

  return (
    <div className="device-strip" role="group" aria-label="Hardware ports">
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
        const focus = sel.setupRoleId === role.id;
        return (
          <button
            key={role.id}
            type="button"
            className={`device-chip${!role.midi || connected ? '' : ' disconnected'}${focus ? ' focus' : ''}`}
            onClick={() => {
              carrySetupRole(role.id, `Ports · ${role.label}`);
              setWorkspace('setup');
            }}
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
