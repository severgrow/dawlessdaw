import {
  BENCH_GROUPS,
  BENCH_TESTS,
  MPC_MUTE_LEARN_CC,
  MPC_MUTE_LEARN_CHANNEL,
  type BenchVerdict,
} from '@dawlessdaw/devices';
import { RouteSignal } from './RouteSignal';
import { CircuitTracksProbe } from './CircuitTracksProbe';
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
  const timing = snap.midiTimingSummary;
  const health = actions.getRuntime().midiBenchHealth();
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
          <button type="button" onClick={() => actions.downloadBenchJson()}>
            Export results
          </button>
        </div>
      </div>
      <RouteSignal />

      <div className="panel" aria-label="MIDI send timing" role="region">
        <div className="row">
          <h2>MIDI send timing</h2>
          <button type="button" onClick={actions.resetMidiSendTiming}>Reset timing</button>
        </div>
        <p className="muted small">Measures when SPLOT sends MIDI. Use the rig to check when you hear sound.</p>
        <dl>
          <dt>Live Circuit · all outputs</dt>
          <dd>{timing.received} note-ons received · {timing.live.sends} sent
            {timing.live.maxMs != null && ` · ${health.p95Ms.live} ms p95 · ${timing.live.maxMs} ms worst since reset`}</dd>
          <dt>Live Circuit → MPC · recent sends</dt>
          <dd>{snap.latencyStats
            ? `${snap.latencyStats.samples} sends · ${snap.latencyStats.meanMs} ms average · ${snap.latencyStats.maxMs} ms worst · ${snap.latencyStats.jitterMs} ms jitter`
            : 'Play Circuit notes routed to MPC.'}</dd>
          <dt>Song playback</dt>
          <dd>{snap.songTimingStats
            ? `${snap.songTimingStats.samples} sends · ${snap.songTimingStats.meanMs} ms average late · ${snap.songTimingStats.maxMs} ms worst · ${snap.songTimingStats.jitterMs} ms jitter`
            : 'Play a Song clip to measure how closely notes hit their scheduled times.'}</dd>
          <dt>Send failures and held notes</dt>
          <dd>{health.failedNoteSends.live + health.failedNoteSends.song} failed routed note messages · {health.heldNotes} notes currently tracked as held</dd>
        </dl>
        <p className="muted small">Reset before a take. Export results includes recent inputs, sends, and the slowest send in each mode since reset.</p>
      </div>

      <CircuitTracksProbe />

      {experimental ? (
        <CircuitDeepSyncBench />
      ) : (
        <p className="muted small">
          Circuit Deep Sync is under Settings → Ports → “Show experimental tools”.
        </p>
      )}

      <p className="muted small">Bench checks · {done}/{BENCH_TESTS.length} completed · {passed} passed</p>
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
