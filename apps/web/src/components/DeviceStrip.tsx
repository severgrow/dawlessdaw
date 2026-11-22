import { MY_STUDIO_ROLES } from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function DeviceStrip() {
  const snap = useStudioStore();
  const { selectDevice } = useStudioActions();
  const softId = snap.focus.softFocus?.deviceId;

  return (
    <div className="device-strip" role="list">
      {MY_STUDIO_ROLES.map((role) => {
        const assignment = snap.assignments.find((a) => a.roleId === role.id);
        const device = snap.devices.find((d) => d.kind === role.kind);
        const connected = assignment?.connected ?? Boolean(device?.connected);
        const isFocus = device && snap.focus.activeDeviceId === device.id;
        const isSoft = device && softId === device.id && !isFocus;
        return (
          <button
            key={role.id}
            type="button"
            role="listitem"
            className={`device-chip ${isFocus ? 'focus' : ''} ${isSoft ? 'soft' : ''} ${
              connected ? '' : 'disconnected'
            }`}
            onClick={() => device && selectDevice(device.id)}
            title={
              connected
                ? `${assignment?.inputPortName ?? ''} / ${assignment?.outputPortName ?? ''}`
                : 'Not connected'
            }
            style={connected ? undefined : { opacity: 0.45 }}
          >
            <span className="name">{role.label}</span>
            <span className="meta">
              {role.midi ? 'MIDI' : 'AUDIO'}
              {' · '}
              {connected ? 'connected' : 'not connected'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
