import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function DeviceStrip() {
  const snap = useStudioStore();
  const { selectDevice, pinDevice } = useStudioActions();
  const softId = snap.focus.softFocus?.deviceId;

  return (
    <div className="device-strip" role="list">
      {snap.devices.map((d) => {
        const isFocus = snap.focus.activeDeviceId === d.id;
        const isSoft = softId === d.id && !isFocus;
        const isPinned = snap.focus.pinnedDeviceId === d.id;
        const topCap = d.capabilities[0];
        return (
          <button
            key={d.id}
            type="button"
            role="listitem"
            className={`device-chip ${isFocus ? 'focus' : ''} ${isSoft ? 'soft' : ''}`}
            onClick={() => selectDevice(d.id)}
            onDoubleClick={() => pinDevice(isPinned ? null : d.id)}
            title="Click to focus · double-click to pin"
          >
            <span className="name">
              {isPinned ? '[PIN] ' : ''}
              {d.displayName}
            </span>
            <span className="meta">
              {d.midiEnabled ? 'MIDI' : 'AUDIO'}
              {d.firmwareProfile ? ` · ${d.firmwareProfile}` : ''}
              {topCap ? (
                <>
                  {' · '}
                  <span className={`cap-dot ${topCap.status}`} />
                  {topCap.status}
                </>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
