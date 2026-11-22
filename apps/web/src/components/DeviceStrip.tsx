import { MY_STUDIO_ROLES, unmatchedConnectedPorts } from '@dawlessdaw/devices';
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
      title:
        'Web MIDI has connected ports not assigned to this role — open Setup and pick the port (e.g. Felucca → FM1)',
    };
  }
  return {
    label: 'no Web MIDI port',
    title:
      'Chrome Web MIDI does not list a port for this role. Check USB, power, and Audio MIDI Setup — Setup → Troubleshooting shows exactly what the browser sees.',
  };
}

export function DeviceStrip() {
  const snap = useStudioStore();
  const { setWorkspace } = useStudioActions();
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments);
  const hasUnmatchedPorts = unmatched.length > 0;

  return (
    <div className="device-strip" role="list">
      {MY_STUDIO_ROLES.map((role) => {
        const assignment = snap.assignments.find((a) => a.roleId === role.id);
        const connected = Boolean(assignment?.connected);
        const status = role.midi
          ? midiStripStatus(connected, hasUnmatchedPorts)
          : {
              label: 'usb audio · not checked',
              title:
                'USB audio only — the app cannot see it over MIDI. Check it in System Information or Audio MIDI Setup.',
            };
        // Show the port actually used (e.g. MPC → "Scarlett 2i4 USB").
        const portName =
          role.id === 'circuit'
            ? assignment?.inputPortName
            : (assignment?.outputPortName ?? assignment?.inputPortName);
        const via = connected && portName && !portName.toLowerCase().includes(role.label.split(' ').pop()!.toLowerCase())
          ? `via ${portName}`
          : null;
        return (
          <button
            key={role.id}
            type="button"
            role="listitem"
            className={`device-chip ${role.midi && connected ? '' : 'disconnected'}`}
            onClick={() => setWorkspace('setup')}
            title={connected ? `${assignment?.inputPortName ?? '—'} in · ${assignment?.outputPortName ?? '—'} out — click for Setup` : `${status.title} — click for Setup`}
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
