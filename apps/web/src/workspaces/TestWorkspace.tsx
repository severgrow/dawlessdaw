import {
  BENCH_GROUPS,
  BENCH_TESTS,
  MPC_MUTE_LEARN_CC,
  MPC_MUTE_LEARN_CHANNEL,
  type BenchVerdict,
} from '@dawlessdaw/devices';
import { CircuitDeepSyncBench } from '../circuit-deep-sync/CircuitDeepSyncBench';
import { loadExperimentalUi } from '../nav/tabs';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const VERDICT_LABEL: Record<BenchVerdict, string> = {
  pass: 'pass',
  fail: 'fail',
  unsure: 'unsure',
  pending: '—',
};

export function TestWorkspace() {
  const snap = useStudioStore();
  const actions = useStudioActions();
  const experimental = loadExperimentalUi();
  const verdict = (id: string): BenchVerdict =>
    snap.benchResults.find((r) => r.id === id)?.verdict ?? 'pending';
  const done = BENCH_TESTS.filter((t) => verdict(t.id) !== 'pending').length;
  const passed = BENCH_TESTS.filter((t) => verdict(t.id) === 'pass').length;

  return (
    <div className="section-enter">
      <div className="page-head">
        <h1>tests</h1>
        <div className="row">
          <span className="readout">
            done <b>{done}</b>/{BENCH_TESTS.length} · pass <b>{passed}</b>
          </span>
          <button type="button" onClick={() => actions.downloadBenchJson()}>
            Export results
          </button>
        </div>
      </div>
      <p className="lead">Open a card · follow steps · mark pass / fail. App only shows MIDI it heard.</p>

      {experimental ? (
        <CircuitDeepSyncBench />
      ) : (
        <p className="muted small">
          Circuit Deep Sync is under Settings → Ports → “Show experimental tools”.
        </p>
      )}

      {BENCH_GROUPS.map((g) => {
        const tests = BENCH_TESTS.filter((t) => t.group === g.id);
        if (!tests.length) return null;
        const groupDone = tests.filter((t) => verdict(t.id) !== 'pending').length;
        return (
          <section key={g.id} className="bench-group">
            <h2 className="group-title">
              {g.label}
              <span className="muted mono">
                {' '}
                {groupDone}/{tests.length}
              </span>
            </h2>
            {tests.map((t) => {
              const open = snap.activeBenchId === t.id;
              const v = verdict(t.id);
              const result = snap.benchResults.find((r) => r.id === t.id);
              const [code, ...rest] = t.title.split('. ');
              return (
                <div key={t.id} className={`bench-item${open ? ' open' : ''}`} data-verdict={v}>
                  <button
                    type="button"
                    className="bench-head"
                    aria-expanded={open}
                    onClick={() => actions.setActiveBench(open ? null : t.id)}
                  >
                    <span className="bench-code mono">{rest.length ? code : ''}</span>
                    <span className="bench-title">{rest.length ? rest.join('. ') : t.title}</span>
                    <span className={`verdict-tag v-${v}`}>{VERDICT_LABEL[v]}</span>
                  </button>
                  {open ? (
                    <div className="bench-body">
                      <p className="lead">{t.instruction}</p>
                      <p className="muted mono small">App listens for: {t.listenHint}</p>
                      {t.id === 'timing-circuit-to-mpc' && snap.latencyStats ? (
                        <p className="mono">
                          {snap.latencyStats.samples} notes · {snap.latencyStats.meanMs} ms average
                          · {snap.latencyStats.jitterMs} ms jitter — {snap.latencyStats.message}
                          <br />
                          <span className="muted">
                            Mac side only: the Scarlett&apos;s USB → DIN hop (~1 ms per note) and
                            the MPC are not included. Trust your ears too.
                          </span>
                        </p>
                      ) : null}
                      <div className="row">
                        {t.id === 'circuit-scene-any-midi' ? (
                          <button type="button" onClick={() => actions.startSceneMidiCapture()}>
                            {snap.capturingSceneMidi ? 'Capturing 10 s…' : 'Start 10 s capture'}
                          </button>
                        ) : null}
                        {t.id === 'sp-pattern-pc' ? (
                          <button type="button" onClick={() => actions.sendBenchSpProgramChange(0)}>
                            Send test pattern change → SP
                          </button>
                        ) : null}
                        {t.id === 'mpc-sequence-pc' ? (
                          <button type="button" onClick={() => actions.sendBenchMpcProgramChange(0)}>
                            Send test program change → MPC
                          </button>
                        ) : null}
                        {t.id === 'mpc-mute-cc' ? (
                          <button type="button" onClick={() => actions.sendBenchMpcMuteCc()}>
                            Send mute CC {MPC_MUTE_LEARN_CC} ch{MPC_MUTE_LEARN_CHANNEL}
                          </button>
                        ) : null}
                        {t.id === 'mpc-scarlett-clock' ? (
                          <button type="button" onClick={() => actions.sendBenchMpcClockBurst()}>
                            Send test start / clock / stop → MPC
                          </button>
                        ) : null}
                      </div>
                      <div className="row verdict-row">
                        <span className="muted mono">What happened?</span>
                        {(['pass', 'fail', 'unsure'] as const).map((x) => (
                          <button
                            key={x}
                            type="button"
                            className={`verdict-${x} ${v === x ? 'active' : ''}`}
                            onClick={() => actions.markBench(t.id, x)}
                          >
                            {x}
                          </button>
                        ))}
                      </div>
                      <ul className="event-log">
                        {(result?.detections?.length ? result.detections : snap.benchDetections).slice(0, 12).map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
