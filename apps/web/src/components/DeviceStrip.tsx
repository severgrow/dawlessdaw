import { MY_STUDIO_ROLES, unmatchedConnectedPorts } from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

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
        'Web MIDI has connected ports not assigned to this role — open Settings and pick the port (e.g. Felucca → FM1)',
    };
  }
  return {
    label: 'no Web MIDI port',
    title:
      'Chrome Web MIDI does not list a port for this role. Check USB, power, and Audio MIDI Setup — Patchbay Ports shows exactly what the browser sees.',
  };
}

export function DeviceStrip() {
  const snap = useStudioStore();
  const { selectDevice } = useStudioActions();
  const softId = snap.focus.softFocus?.deviceId;
  const unmatched = unmatchedConnectedPorts(snap.ports, snap.assignments);
  const hasUnmatchedPorts = unmatched.length > 0;

  return (
    <div className="device-strip" role="list">
      {MY_STUDIO_ROLES.map((role) => {
        const assignment = snap.assignments.find((a) => a.roleId === role.id);
        const device = snap.devices.find((d) => d.kind === role.kind);
        const connected = assignment?.connected ?? Boolean(device?.connected);
        const isFocus = device && snap.focus.activeDeviceId === device.id;
        const isSoft = device && softId === device.id && !isFocus;
        const status = role.midi
          ? midiStripStatus(connected, hasUnmatchedPorts)
          : {
              label: 'not checked',
              title:
                'USB audio only — the app cannot see it over MIDI. Check it in System Information or Audio MIDI Setup.',
            };
        const portTitle = connected
          ? `${assignment?.inputPortName ?? ''} / ${assignment?.outputPortName ?? ''}`
          : status.title;
        return (
          <button
            key={role.id}
            type="button"
            role="listitem"
            className={`device-chip ${isFocus ? 'focus' : ''} ${isSoft ? 'soft' : ''} ${
              role.midi && connected ? '' : 'disconnected'
            }`}
            onClick={() => device && selectDevice(device.id)}
            title={portTitle}
          >
            <span className="name">{role.label}</span>
            <span className="meta">
              {role.midi ? 'MIDI' : 'AUDIO'}
              {' · '}
              {status.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
