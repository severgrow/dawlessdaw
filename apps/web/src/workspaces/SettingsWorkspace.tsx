import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function SettingsWorkspace() {
  const snap = useStudioStore();
  const { setSimulation, getAssistantTools, getRuntime } = useStudioActions();
  const tools = getAssistantTools();
  const native = getRuntime().getNativeBridgeStub();

  return (
    <div className="section-enter">
      <h1>Settings</h1>
      <p className="lead">Transports, honesty flags, and the AssistantTool extension point.</p>

      <div className="panel">
        <h2>Transport</h2>
        <p className="mono">
          Active: {snap.transportKind} · simulation={String(snap.simulation)}
        </p>
        <div className="row">
          <button type="button" onClick={() => void setSimulation(true)}>
            MockMidiTransport
          </button>
          <button type="button" onClick={() => void setSimulation(false)}>
            WebMidiTransport
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          NativeBridgeTransport available={String(native.isAvailable())} (stub — unavailable in
          v0.1)
        </p>
      </div>

      <div className="panel">
        <h2>AssistantTool registry</h2>
        <p className="lead">Extension point only — no AI runtime dependency.</p>
        <ul className="cap-list">
          {tools.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong>
              <div className="muted">{t.description}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
