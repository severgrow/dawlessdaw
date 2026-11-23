import { describe, expect, it } from 'vitest';
import { CircuitIntelligenceEngine, INTEL_MACRO_CCS } from './circuit-intelligence';
import { CLOCKS_PER_STEP } from './scheduler';

function advanceSteps(eng: CircuitIntelligenceEngine, steps: number): void {
  for (let i = 0; i < steps * CLOCKS_PER_STEP; i++) eng.onClock();
}

describe('CircuitIntelligenceEngine', () => {
  it('tracks last-touched from CC 21–28 with High confidence', () => {
    const eng = new CircuitIntelligenceEngine({ now: () => 1000 });
    const hit = eng.onMacroCc(3, 21, 64);
    expect(hit).toEqual({ track: 3, knob: 0, shouldAutoFocus: true });
    const snap = eng.getSnapshot();
    expect(snap.lastTouched.track).toBe(3);
    expect(snap.lastTouched.knob).toBe(0);
    expect(snap.lastTouched.cc).toBe(21);
    expect(snap.lastTouched.confidence).toBe('High');
    expect(snap.events[0]?.kind).toBe('last-touched');
  });

  it('respects auto-focus off for shouldAutoFocus', () => {
    const eng = new CircuitIntelligenceEngine({ autoFocus: false });
    const hit = eng.onMacroCc(2, INTEL_MACRO_CCS[3]!, 10);
    expect(hit?.shouldAutoFocus).toBe(false);
    expect(eng.getSnapshot().autoFocus).toBe(false);
  });

  it('ignores non-macro CCs and bad channels', () => {
    const eng = new CircuitIntelligenceEngine();
    expect(eng.onMacroCc(1, 74, 10)).toBeNull();
    expect(eng.onMacroCc(9, 21, 10)).toBeNull();
    expect(eng.getSnapshot().lastTouched.track).toBeNull();
  });

  it('counts position from Start/Clock and stops', () => {
    let t = 0;
    const eng = new CircuitIntelligenceEngine({ now: () => (t += 10) });
    eng.onTransportStart();
    // 96 clocks = 1 bar in 4/4
    for (let i = 0; i < 96; i++) eng.onClock();
    let pos = eng.getSnapshot().position;
    expect(pos.transport).toBe('playing');
    expect(pos.bar).toBe(2);
    expect(pos.beat).toBe(1);
    eng.onTransportStop();
    pos = eng.getSnapshot().position;
    expect(pos.transport).toBe('stopped');
  });

  it('records project change informationally', () => {
    const eng = new CircuitIntelligenceEngine({ now: () => 50 });
    eng.onProjectChange(2);
    const pos = eng.getSnapshot().position;
    expect(pos.lastProject).toEqual({
      program: 2,
      index: 3,
      kind: 'instant',
      at: 50,
    });
    eng.onProjectChange(64);
    expect(eng.getSnapshot().position.lastProject?.kind).toBe('queued');
    expect(eng.getSnapshot().position.lastProject?.index).toBe(1);
  });

  it('labels Active then Possible mute after learned silence', () => {
    const eng = new CircuitIntelligenceEngine({ now: () => 1 });
    eng.onTransportStart();
    // Two full loops with T1 hitting step 0
    for (let loop = 0; loop < 2; loop++) {
      eng.onNoteOn(1, 60, 100);
      advanceSteps(eng, 16);
    }
    expect(eng.getSnapshot().tracks[0]!.label).toBe('Active');
    expect(eng.getSnapshot().tracks[0]!.learned).toBe(true);

    // Silent loop
    advanceSteps(eng, 16);
    expect(eng.getSnapshot().tracks[0]!.label).toBe('Possible mute');
    expect(eng.getSnapshot().tracks[0]!.confidence).toBe('Low');
  });

  it('keeps Unknown when never learned', () => {
    const eng = new CircuitIntelligenceEngine();
    eng.onTransportStart();
    advanceSteps(eng, 16);
    expect(eng.getSnapshot().tracks[0]!.label).toBe('Unknown');
  });

  it('flags Possible pattern change when fingerprint shifts', () => {
    const eng = new CircuitIntelligenceEngine({ now: () => 1 });
    eng.onTransportStart();
    // Learn hits on steps 0–3
    for (let loop = 0; loop < 2; loop++) {
      for (let s = 0; s < 4; s++) {
        eng.onNoteOn(1, 60, 100);
        advanceSteps(eng, 1);
      }
      advanceSteps(eng, 12);
    }
    expect(eng.getSnapshot().tracks[0]!.learned).toBe(true);

    // Completely different: hits on steps 12–15 only
    advanceSteps(eng, 12);
    for (let s = 0; s < 4; s++) {
      eng.onNoteOn(1, 62, 100);
      advanceSteps(eng, 1);
    }
    expect(eng.getSnapshot().tracks[0]!.label).toBe('Possible pattern change');
  });

  it('getSnapshot is stable until mutation', () => {
    const eng = new CircuitIntelligenceEngine();
    const a = eng.getSnapshot();
    const b = eng.getSnapshot();
    expect(a).toBe(b);
    eng.onMacroCc(1, 21, 1);
    const c = eng.getSnapshot();
    expect(c).not.toBe(a);
  });

  it('exportDiagnostic is passive metadata only', () => {
    const eng = new CircuitIntelligenceEngine();
    eng.onTransportStart();
    const d = eng.exportDiagnostic();
    expect(d.feature).toBe('circuit-intelligence');
    expect(d.honesty).toBe('experimental');
    expect(String(d.disclaimer)).toMatch(/never auto-mute/i);
  });
});
