import { useMemo, useState } from 'react';
import {
  CIRCUIT_MACRO_CCS,
  SP_EFFECT_CCS,
  SP_MODE_A_BANKS,
  SP_SETUP_STEPS,
  SP404_DOC,
  type SpSetupStep,
} from '@dawlessdaw/devices';
import { MoreInfo } from '../components/MoreInfo';
import { SP_IMPORT_HINT } from '../sp404/spImportPath';
import { SpUsbPanel, spUsbPanelEnabled } from '../sp404/usb';
import { useStudioActions, useStudioStore } from '../store/useStudioStore';

const SETUP_DONE_KEY = 'dawlessdaw.spSetupDone';

function loadSetupDone(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SETUP_DONE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveSetupDone(done: Record<string, boolean>): void {
  try {
    localStorage.setItem(SETUP_DONE_KEY, JSON.stringify(done));
  } catch {
    /* ignore */
  }
}

function tickFresh(lastAt: number | null, windowMs = 2500): boolean {
  return lastAt != null && Date.now() - lastAt < windowMs;
}

function SetupPicture({ step }: { step: SpSetupStep }) {
  const glyph =
    step.tick === 'note' ? '♪' : step.tick === 'cc' ? '◎' : step.tick === 'pc' ? 'P' : '◷';
  return (
    <div className={`sp3-pic sp3-pic-${step.picture}`} aria-hidden>
      <span className="sp3-pic-glyph">{glyph}</span>
      <span className="sp3-pic-caption">{step.title}</span>
    </div>
  );
}

/**
 * Phase 3 — deeper SP-404MKII: checklist, live ticks, effect-by-ear,
 * pad map learn walk, USB browse (read-only), DOOM note.
 * Never writes over USB; never flashes firmware. WAV→IMPORT/ is the only write path.
 */
export function SpWorkspace() {
  const snap = useStudioStore();
  const a = useStudioActions();
  const [done, setDone] = useState(loadSetupDone);
  const [nameDraft, setNameDraft] = useState<Record<number, string>>({});
  const [learnTrack, setLearnTrack] = useState(7);
  const ticks = snap.spLiveTicks;
  const fx = snap.spEffectNames;
  const hit = snap.lastSpPadHit;
  const spOut = Boolean(snap.assignments.find((x) => x.roleId === 'sp404')?.outputPortId);
  const doom = snap.devices.some(
    (d) => d.kind === 'sp404mkii' && d.firmwareProfile === 'doom',
  );

  const tickLive = useMemo(
    () => ({
      note: tickFresh(ticks.note.lastAt),
      cc: tickFresh(ticks.cc.lastAt),
      pc: tickFresh(ticks.pc.lastAt),
      clock: tickFresh(ticks.clock.lastAt, 400),
    }),
    [ticks],
  );

  const toggleDone = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    saveSetupDone(next);
  };

  const spTracks = snap.controller.tracks
    .map((tr, i) => ({ track: i + 1, dest: tr.dest }))
    .filter((t) => t.dest?.device === 'sp');

  return (
    <div className="section-enter sp-phase3">
      <div className="page-head">
        <h1>SP-404MKII</h1>
        <span className="ci-badge">experimental</span>
        <span className="readout">
          SP {spOut ? <b>out assigned</b> : 'not assigned'}
          {hit && Date.now() - hit.at < 800 ? (
            <>
              {' '}
              · playing <b>{hit.bank}{String(hit.pad).padStart(2, '0')}</b>
            </>
          ) : null}
        </span>
      </div>
      <p className="lead">
        Setup, live ticks, name effect knobs by ear, and Circuit→pad map. USB browse is read-only.
        The only write path is WAV into SD <code>IMPORT/</code> — never flash firmware.
      </p>

      <div className="panel callout" role="note">
        <strong>Mode A vs Mode B</strong> — Mode A: banks A–J = MIDI channels 1–10, pads = notes
        36–51 (use this with Circuit). Mode B: different channel layout — leave it unless you know
        you need it. Clock: set SP sync to <strong>external</strong> when Circuit (or the thru box)
        is the leader.
      </div>

      <div className="panel sp3-ticks" role="status">
        <h2>Live ticks (toward SP)</h2>
        <p className="muted small">
          Lights when Splot sends Note / CC / Program Change / Clock to the SP out port.
        </p>
        <div className="sp3-tick-row">
          {(
            [
              ['note', 'Note', ticks.note],
              ['cc', 'CC', ticks.cc],
              ['pc', 'PC', ticks.pc],
              ['clock', 'Clock', ticks.clock],
            ] as const
          ).map(([key, label, t]) => (
            <div key={key} className={`sp3-tick${tickLive[key] ? ' live' : ''}`}>
              <b>{label}</b>
              <span className="mono">{t.count}</span>
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => a.resetSpLiveTicks()}>
            Reset
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Circuit → SP pad map</h2>
        <p className="muted small">
          Visual map from Controller tracks that target the SP. Learn walk: pick a Circuit track,
          press “Learn first note”, play the Circuit note that should hit pad 1.
        </p>
        {spTracks.length === 0 ? (
          <p className="warn">No Controller track points at the SP — set T7/T8 (or others) to SP banks.</p>
        ) : (
          <div className="sp3-pad-maps">
            {spTracks.map(({ track, dest }) => {
              const bank = dest ? SP_MODE_A_BANKS[(dest.slot - 1) % 10]! : 'A';
              const tr = snap.controller.tracks[track - 1]!;
              const first = tr.firstNote;
              const hitHere =
                hit &&
                dest &&
                hit.bank === bank &&
                Date.now() - hit.at < 600;
              return (
                <div key={track} className="sp3-pad-map">
                  <header>
                    <b>
                      T{track} → SP bank {bank}
                    </b>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setLearnTrack(track);
                        a.learnFirstNote(track);
                      }}
                    >
                      Learn first note
                    </button>
                  </header>
                  <p className="mono small muted">
                    Pad 1 note = {first ?? '—'} · macros{' '}
                    {CIRCUIT_MACRO_CCS.map((c) => c).slice(0, 2).join('/')}…
                    {snap.controllerLearn?.kind === 'first-note' &&
                    snap.controllerLearn.track === track
                      ? ' · listening…'
                      : ''}
                  </p>
                  <div className="sp3-pads" aria-label={`Pads for bank ${bank}`}>
                    {Array.from({ length: 16 }, (_, i) => {
                      const pad = i + 1;
                      const lit = hitHere && hit!.pad === pad;
                      return (
                        <span key={pad} className={`sp3-pad${lit ? ' lit' : ''}`}>
                          {bank}
                          {String(pad).padStart(2, '0')}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <MoreInfo>
          <p className="muted small">
            Learn track currently armed: T{learnTrack}. Pad lights follow notes Splot sends to the
            SP (Mode A 36–51). SD / USB pad <em>names</em> live under Sounds → SP samples.
          </p>
        </MoreInfo>
      </div>

      <div className="panel">
        <h2>SP setup checklist</h2>
        <ol className="sp3-checklist">
          {SP_SETUP_STEPS.map((step) => (
            <li key={step.id} className={done[step.id] ? 'done' : ''}>
              <label className="sp3-check-label">
                <input
                  type="checkbox"
                  checked={Boolean(done[step.id])}
                  onChange={() => toggleDone(step.id)}
                />
                <span>
                  <strong>{step.title}</strong>
                  {tickLive[step.tick] ? (
                    <span className="sp3-live-pill">hearing {step.tick}</span>
                  ) : null}
                </span>
              </label>
              <SetupPicture step={step} />
              <p className="muted small">{step.how}</p>
              <p className="mono small muted">{step.cite}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <h2>Name effect knobs by ear</h2>
        <p className="muted small">
          Guided sweep of Roland CTRL CCs {SP_EFFECT_CCS.join(', ')}. Watch which physical knob
          moves, type a name, save. Stays <strong>untested</strong> until you confirm on hardware —
          never auto-verified. {SP404_DOC.midiImpl}.
        </p>
        <div className="row">
          <label className="sp3-field">
            SP channel
            <input
              className="num-input"
              type="number"
              min={1}
              max={16}
              value={fx.channel}
              onChange={(e) => a.setSpEffectChannel(Number(e.target.value) || 1)}
            />
          </label>
          <button
            type="button"
            disabled={Boolean(snap.spEffectSweep?.running) || !spOut}
            onClick={() => a.startSpEffectSweep()}
          >
            Sweep all CTRL CCs
          </button>
          {snap.spEffectSweep?.running ? (
            <button type="button" className="ghost" onClick={() => a.stopSpEffectSweep()}>
              Stop sweep (CC {snap.spEffectSweep.cc})
            </button>
          ) : null}
        </div>
        <div className="sp3-fx-grid">
          {fx.knobs.map((k) => (
            <div key={k.cc} className="sp3-fx-row">
              <span className="mono">CC {k.cc}</span>
              <input
                className="text-input"
                type="text"
                maxLength={40}
                aria-label={`Name for CC ${k.cc}`}
                value={nameDraft[k.cc] ?? k.label}
                onChange={(e) => setNameDraft((d) => ({ ...d, [k.cc]: e.target.value }))}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  a.nameSpEffectKnob(k.cc, nameDraft[k.cc] ?? k.label);
                  a.startSpEffectSweep(k.cc);
                }}
              >
                Sweep + save
              </button>
              <span className={`sp3-honesty ${k.honesty}`}>{k.honesty}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Owner verified: {fx.ownerVerified ? 'yes' : 'no'} — only Patryk should flip this after
          hearing the knobs.
        </p>
        <button
          type="button"
          className="ghost"
          onClick={() => a.markSpEffectNamesVerified(!fx.ownerVerified)}
        >
          {fx.ownerVerified ? 'Clear verified' : 'Mark verified (owner only)'}
        </button>
      </div>

      <div className="panel">
        <h2>Send WAV to IMPORT/</h2>
        <p className="muted small">
          One-click path: Record → Sessions (or SP samples) → pick pad → Write to IMPORT (48 kHz /
          16-bit). Then on the SP: <strong>{SP_IMPORT_HINT.replace(/^Then on SP:\s*/i, '')}</strong>{' '}
          — Roland Reference Manual. If your menus differ, check the manual.
        </p>
        <button type="button" onClick={() => a.setWorkspace('sessions')}>
          Open Sessions (Send to SP)
        </button>
        <button type="button" className="ghost" onClick={() => a.setWorkspace('samples')}>
          Open SP samples
        </button>
      </div>

      <div className="panel">
        <h2>USB Browse SP · experimental</h2>
        <p className="callout" role="status">
          Read-only CDC (open404 MIT). Allow-list blocks write/erase. Known-good firmware{' '}
          <strong>5.51</strong>. Firmware <strong>5.52</strong> needs your explicit OK before we
          treat it as fine — ask Patryk; do not assume. Never write pads over USB; never flash.
        </p>
        {spUsbPanelEnabled() ? (
          <SpUsbPanel />
        ) : (
          <p className="muted small">
            Enable with <code>?spUsb=1</code> or Settings → experimental tools. Panel stays
            read-only.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>DOOM OS</h2>
        <p className="muted small">
          {doom
            ? 'DOOM OS profile is selected — DOOM-specific features stay unknown/unverified. Stock Mode A paths above still apply until bench Pass.'
            : 'If you select the DOOM OS firmware profile in Ports / device identity, Splot only shows this note — no DOOM-only writes, no flash. Stock MIDI Mode A is the supported path.'}
        </p>
      </div>
    </div>
  );
}
