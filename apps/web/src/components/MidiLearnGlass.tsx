import {
  SLOT_COUNT,
  destBadge,
  slotLabel,
  targetsFor,
  type CtrlDevice,
  type CtrlDest,
} from '@dawlessdaw/devices';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const DEST_OPTIONS: Array<{ id: CtrlDevice | 'off'; label: string }> = [
  { id: 'fm1', label: 'FM1' },
  { id: 'sp', label: 'SP-404' },
  { id: 'mpc', label: 'MPC One' },
  { id: 'off', label: 'Off' },
];

function deviceClass(d: CtrlDevice | null | undefined) {
  return d ? `dev-${d}` : 'dev-off';
}

/**
 * Dark frosted-glass overlay: twist a Circuit macro / mixer control → see what
 * it does and change destination / param without leaving the current tab.
 */
export function MidiLearnGlass() {
  const glass = useStudioStore((s) => s.midiLearnGlass);
  const controller = useStudioStore((s) => s.controller);
  const a = useStudioActions();

  if (!glass) return null;

  const { mapping, learnReassign, pinned } = glass;
  const track = controller.tracks[mapping.track - 1]!;
  const dest = track.dest;
  const knob = mapping.knob;
  const slot = knob != null ? track.knobs[knob] : null;

  const setDest = (device: CtrlDevice | 'off') => {
    if (device === 'off') {
      a.setControllerTrack(mapping.track, { dest: null });
      return;
    }
    const slotN =
      dest?.device === device ? dest.slot : Math.min(mapping.track, SLOT_COUNT[device]);
    a.setControllerTrack(mapping.track, { dest: { device, slot: slotN } });
  };

  const setSlot = (n: number) => {
    if (!dest) return;
    a.setControllerTrack(mapping.track, { dest: { device: dest.device, slot: n } as CtrlDest });
  };

  const setTarget = (target: string) => {
    if (knob == null) return;
    a.setControllerKnob(mapping.track, knob, {
      target: target || null,
      ...(target === 'custom' ? { cc: slot?.cc ?? 102 } : {}),
    });
  };

  return (
    <aside
      className={`midi-learn-glass mlg-focus ${deviceClass(mapping.dest?.device)}`}
      role="dialog"
      aria-label="MIDI control mapping"
    >
      <header className="mlg-head">
        <span className="mlg-kicker">Learn · T{mapping.track}</span>
        <span className="mlg-actions-top">
          <button
            type="button"
            className={pinned ? 'active' : 'ghost'}
            title="Keep this window open"
            onClick={() => a.setMidiLearnPinned(!pinned)}
          >
            {pinned ? 'pinned' : 'pin'}
          </button>
          <button type="button" className="ghost" onClick={() => a.snoozeMidiLearnGlass()} title="Hide for 10 seconds">
            10s
          </button>
          <button type="button" className="ghost" aria-label="Close" onClick={() => a.dismissMidiLearnGlass()}>
            ×
          </button>
        </span>
      </header>

      <div className="mlg-source">
        <strong>{mapping.sourceLabel}</strong>
      </div>

      {mapping.detail ? <p className="mlg-detail">{mapping.detail}</p> : null}

      <label className="mlg-field">
        <span>Destination</span>
        <div className="mlg-dest-row" role="radiogroup" aria-label="Destination device">
          {DEST_OPTIONS.map((opt) => {
            const on = opt.id === 'off' ? !dest : dest?.device === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`mlg-chip ${opt.id === 'off' ? 'dev-off' : deviceClass(opt.id)}${on ? ' active' : ''}`}
                onClick={() => setDest(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </label>

      {dest ? (
        <label className="mlg-field">
          <span>{dest.device === 'sp' ? 'Bank' : 'Track slot'}</span>
          <select
            className="select-inline"
            value={dest.slot}
            onChange={(e) => setSlot(Number(e.target.value))}
          >
            {Array.from({ length: SLOT_COUNT[dest.device] }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {slotLabel({ device: dest.device, slot: n })}
              </option>
            ))}
          </select>
          <span className="mlg-badge">{destBadge(dest)}</span>
        </label>
      ) : (
        <p className="mlg-note">Off — nothing forwarded for T{mapping.track}.</p>
      )}

      {mapping.editableKnob && knob != null && dest ? (
        <label className="mlg-field">
          <span>Macro {knob + 1} sends</span>
          <select
            className="select-inline"
            value={slot?.target ?? ''}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">— not mapped</option>
            {targetsFor(dest.device).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            <option value="custom">Custom CC…</option>
          </select>
          {slot?.target === 'custom' ? (
            <input
              className="num-input"
              type="number"
              min={0}
              max={119}
              aria-label="Custom CC"
              value={slot.cc ?? ''}
              onChange={(e) =>
                a.setControllerKnob(mapping.track, knob, {
                  cc: Math.max(0, Math.min(119, Math.round(Number(e.target.value) || 0))),
                })
              }
            />
          ) : null}
        </label>
      ) : null}

      {mapping.kind !== 'macro' ? (
        <p className="mlg-note">Level/Pan → Vol / Pan on this dest (fixed).</p>
      ) : null}

      <details className="more-info mlg-more">
        <summary>MIDI # · limits</summary>
        <div className="more-info-body">
          <p className="mlg-mono" title="MIDI numbers">
            CC {mapping.sourceCc} · ch{mapping.sourceChannel}
            {mapping.value != null ? ` · ${mapping.value}` : ''}
          </p>
          <p className="mlg-honest">
            Only macros and mixer Level/Pan usually send. Some paths need CC Tx ON in device setup.
          </p>
        </div>
      </details>

      <footer className="mlg-foot">
        {mapping.editableKnob ? (
          <button
            type="button"
            className={learnReassign ? 'active' : 'ghost'}
            onClick={() => (learnReassign ? a.cancelControllerLearn() : a.startMidiLearnReassign())}
          >
            {learnReassign ? 'Listening… twist a macro' : 'Twist another to reassign'}
          </button>
        ) : (
          <span />
        )}
        <span className="mlg-foot-right">
          <button
            type="button"
            className="ghost"
            onClick={() => a.cancelMidiLearnGlass()}
            title="Undo changes made while this window was open"
          >
            Cancel · undo
          </button>
          <button type="button" onClick={() => a.saveMidiLearnGlass()} title="Keep the mapping and close">
            Keep
          </button>
        </span>
      </footer>
    </aside>
  );
}
