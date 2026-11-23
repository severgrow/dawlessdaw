import { memo } from 'react';
import {
  DEFAULT_HW_BINDINGS,
  buildHardwareGuide,
} from '@dawlessdaw/sequencer';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

/**
 * Circuit P2 — opt-in Hardware Control Mode + adaptive Hardware Guide.
 * Buttons stay Guide-only (no invented MIDI). Experimental until Bench.
 */
export const HardwareControlPanel = memo(function HardwareControlPanel() {
  const hw = useStudioStore((state) => state.hardwareControl);
  const hasSource = useStudioStore((state) => state.generative.hasSource);
  const circuitIn = useStudioStore((state) =>
    Boolean(state.assignments.find((assignment) => assignment.roleId === 'circuit')?.inputPortId),
  );
  const a = useStudioActions();
  const guide = buildHardwareGuide({
    circuitInAssigned: circuitIn,
    modeEnabled: hw.prefs.enabled,
    mixerEnabled: hw.prefs.mixerEnabled,
    hasSource,
    ccTxHint: true,
  });
  const next = guide.find((s) => s.active) ?? guide[0];

  return (
    <details className="hw-control panel collapsed-chrome">
      <summary className="hw-control-head">
        <h2>Generative hardware controls</h2>
        <span className={hw.prefs.enabled ? 'ci-badge hw-enabled' : 'ci-badge'}>
          {hw.prefs.enabled ? 'On' : 'Off'}
        </span>
      </summary>
      <p className="muted small hw-control-lead">
        Enable to control the generator from Circuit macros 1–8. Existing Controller mappings remain active.
      </p>

      <div className="hw-control-toggles" role="group" aria-label="Hardware control options">
        <button
          type="button"
          className={hw.prefs.enabled ? 'seq-btn on' : 'seq-btn'}
          aria-pressed={hw.prefs.enabled}
          onClick={() => a.setHardwareControlEnabled(!hw.prefs.enabled)}
        >
          {hw.prefs.enabled ? 'Disable mode' : 'Enable mode'}
        </button>
        <button
          type="button"
          className={hw.prefs.mixerEnabled ? 'seq-btn on' : 'seq-btn ghost'}
          aria-pressed={hw.prefs.mixerEnabled}
          disabled={!hw.prefs.enabled}
          onClick={() => a.setHardwareControlMixer(!hw.prefs.mixerEnabled)}
          title="Optional Mixer Level/Pan CC 29/30"
        >
          Mixer 29/30
        </button>
        {hw.lastAction ? (
          <span className="mono small hw-last">
            T{hw.lastAction.track} · CC{hw.lastAction.cc} · {hw.lastAction.action.replaceAll('-', ' ')}
          </span>
        ) : null}
      </div>

      {hw.prefs.enabled ? (
        <div className="hw-map" aria-label="Macro mapping">
          {DEFAULT_HW_BINDINGS.filter(
            (b) => !b.mixerOptional || hw.prefs.mixerEnabled,
          ).map((b) => (
            <div key={b.cc} className={`hw-map-row${b.kind === 'trigger' ? ' trigger' : ''}`}>
              <span className="mono">CC{b.cc}</span>
              <span className="hw-map-label">{b.label}</span>
              <span className="hw-map-action">{b.action.replace('set-', '')}</span>
              {b.kind === 'trigger' ? (
                <span className="hw-map-kind">Trigger</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="hw-guide" aria-label="Hardware Guide">
        <div className="hw-guide-next">
          <span className="hw-guide-kicker">Next</span>
          <strong>{next?.title}</strong>
          <p className="small muted">{next?.body}</p>
        </div>
        <details className="hw-guide-fold">
          <summary>Guide · buttons (no MIDI)</summary>
          <ul className="hw-guide-list">
            {guide
              .filter((s) => s.kind === 'button' || s.kind === 'safety')
              .map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b> — {s.body}
                </li>
              ))}
          </ul>
        </details>
      </div>
    </details>
  );
});
