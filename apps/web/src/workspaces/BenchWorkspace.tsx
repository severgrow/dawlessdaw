import { BENCH_TESTS, MPC_MUTE_LEARN_CC, MPC_MUTE_LEARN_CHANNEL } from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

export function BenchWorkspace() {
  const snap = useStudioStore();
  const actions = useStudioActions();

  return (
    <div className="section-enter">
      <h1>Bench Test</h1>
      <p className="lead">
        Guided checklist with your real gear. Mark Pass / Fail / Unsure yourself — the app only
        shows what MIDI it heard. No SysEx, no firmware writes.
      </p>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <button type="button" onClick={() => actions.downloadBenchJson()}>
          Export results JSON
        </button>
        <span className="muted mono">dawlessdaw-bench-YYYY-MM-DD.json</span>
      </div>

      {snap.latencyStats ? (
        <p className="mono">
          Timing: {snap.latencyStats.meanMs} ms mean · {snap.latencyStats.jitterMs} ms jitter ·{' '}
          {snap.latencyStats.message}
        </p>
      ) : null}

      {BENCH_TESTS.map((t) => {
        const result = snap.benchResults.find((r) => r.id === t.id);
        return (
          <div
            key={t.id}
            className="panel"
            style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '0.75rem' }}
          >
            <h2>{t.title}</h2>
            <p className="lead">{t.instruction}</p>
            <p className="muted mono">Listen: {t.listenHint}</p>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <button type="button" onClick={() => actions.setActiveBench(t.id)}>
                Focus this test
              </button>
              {t.id === 'circuit-scene-any-midi' ? (
                <button type="button" onClick={() => actions.startSceneMidiCapture()}>
                  {snap.capturingSceneMidi ? 'Capturing 10s…' : 'Start 10s capture'}
                </button>
              ) : null}
              {t.id === 'sp-pattern-pc' ? (
                <button type="button" onClick={() => actions.sendBenchSpProgramChange(0)}>
                  Send test PC → SP
                </button>
              ) : null}
              {t.id === 'mpc-sequence-pc' ? (
                <button type="button" onClick={() => actions.sendBenchMpcProgramChange(0)}>
                  Send test PC → MPC
                </button>
              ) : null}
              {t.id === 'mpc-mute-cc' ? (
                <button type="button" onClick={() => actions.sendBenchMpcMuteCc()}>
                  Send mute CC {MPC_MUTE_LEARN_CC} ch{MPC_MUTE_LEARN_CHANNEL}
                </button>
              ) : null}
              {t.id === 'usb-app-clock' ? (
                <button type="button" onClick={() => actions.sendBenchMpcClockBurst()}>
                  Send test Start/Clock → MPC
                </button>
              ) : null}
            </div>
            <div className="row">
              {(['pass', 'fail', 'unsure'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={result?.verdict === v ? 'active' : ''}
                  onClick={() => actions.markBench(t.id, v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <ul className="event-log" style={{ marginTop: '0.5rem' }}>
              {(result?.detections?.length ? result.detections : snap.benchDetections)
                .slice(0, 12)
                .map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
            </ul>
            <p className="muted mono">Status: {result?.verdict ?? 'pending'}</p>
          </div>
        );
      })}
    </div>
  );
}
