import { describe, expect, it } from 'vitest';
import { PerformanceMemoryEngine } from './performance-memory';
import type { MusicalEvent } from './musical-events';

function musical(
  partial: Partial<MusicalEvent> & Pick<MusicalEvent, 'id' | 'kind' | 'summary'>,
): MusicalEvent {
  return {
    at: 0,
    confidence: 'high',
    honesty: 'experimental',
    data: {},
    ...partial,
  };
}

describe('PerformanceMemoryEngine', () => {
  it('records timeline + auto markers while active', () => {
    let t = 1000;
    let frames = 0;
    const eng = new PerformanceMemoryEngine({ now: () => t });
    eng.start({ sampleRate: 48000, getFrames: () => frames, atMs: t });

    frames = 48000; // 1s
    t = 2000;
    eng.ingestMusicalEvent(
      musical({ id: 1, kind: 'transport-start', summary: 'Transport Start', at: t }),
    );
    frames = 96000;
    t = 3000;
    eng.ingestMusicalEvent(
      musical({
        id: 2,
        kind: 'project-change',
        summary: 'Project 3 (instant)',
        at: t,
        data: { index: 3 },
      }),
    );
    frames = 144000;
    t = 4000;
    eng.ingestMusicalEvent(
      musical({
        id: 3,
        kind: 'pattern-hint',
        summary: 'T2: Possible pattern change',
        confidence: 'low',
        at: t,
        data: { track: 2 },
      }),
    );

    const snap = eng.getSnapshot();
    expect(snap.active).toBe(true);
    expect(snap.events).toHaveLength(3);
    expect(snap.markers).toHaveLength(3);
    expect(snap.markers[0]!.source).toBe('transport');
    expect(snap.markers[1]!.source).toBe('circuit-project');
    expect(snap.markers[2]!.source).toBe('inferred');
    expect(snap.markers[2]!.label.startsWith('inferred:')).toBe(true);
    expect(snap.markers[2]!.inferred).toBe(true);

    const stopped = eng.stop();
    expect(stopped.events).toHaveLength(3);
    expect(eng.isActive()).toBe(false);
  });

  it('dedupes musical event ids and ignores ingest when idle', () => {
    const eng = new PerformanceMemoryEngine({ now: () => 1 });
    expect(eng.ingestMusicalEvent(musical({ id: 1, kind: 'bar', summary: 'Bar 1' }))).toBeNull();

    eng.start({ sampleRate: 48000, getFrames: () => 0 });
    expect(eng.ingestMusicalEvent(musical({ id: 1, kind: 'bar', summary: 'Bar 1' }))).not.toBeNull();
    expect(eng.ingestMusicalEvent(musical({ id: 1, kind: 'bar', summary: 'Bar 1 again' }))).toBeNull();
    expect(eng.getSnapshot().events).toHaveLength(1);
    // bars are timeline-only (no auto marker)
    expect(eng.getSnapshot().markers).toHaveLength(0);
  });

  it('manual markers rename and delete', () => {
    let frames = 1000;
    const eng = new PerformanceMemoryEngine({ now: () => 5000 });
    eng.start({ sampleRate: 1000, getFrames: () => frames });
    const m = eng.addManualMarker('Mark');
    expect(m).not.toBeNull();
    expect(eng.renameMarker(m!.id, 'Drop')).toBe(true);
    expect(eng.getSnapshot().markers[0]!.label).toBe('Drop');
    expect(eng.deleteMarker(m!.id)).toBe(true);
    expect(eng.getSnapshot().markers).toHaveLength(0);
    expect(eng.getSnapshot().events[0]!.markerId).toBeNull();
  });

  it('records macro / morph / flip without flooding markers on macros', () => {
    const eng = new PerformanceMemoryEngine({ now: () => 10 });
    eng.start({ sampleRate: 48000, getFrames: () => 0 });
    eng.recordMacro({ track: 1, knob: 0, cc: 21, value: 64 });
    eng.recordMorph({ phase: 'start', to: 'b' });
    eng.recordFlip({ phase: 'recording' });
    const snap = eng.getSnapshot();
    expect(snap.events.map((e) => e.kind)).toEqual(['macro', 'morph', 'flip']);
    expect(snap.markers.map((m) => m.source)).toEqual(['morph', 'flip']);
  });

  it('section event-actions stay off by default and never allow inference', () => {
    const eng = new PerformanceMemoryEngine({ now: () => 1 });
    eng.start({ sampleRate: 48000, getFrames: () => 0 });
    const confirmed = eng.ingestMusicalEvent(
      musical({ id: 1, kind: 'project-change', summary: 'Project 1', confidence: 'high' }),
    )!;
    const inferred = eng.ingestMusicalEvent(
      musical({
        id: 2,
        kind: 'pattern-hint',
        summary: 'Possible pattern change',
        confidence: 'low',
      }),
    )!;
    expect(eng.getPrefs().sectionEventActionsEnabled).toBe(false);
    expect(eng.mayRunSectionEventAction(confirmed)).toBe(false);
    expect(eng.mayRunSectionEventAction(inferred)).toBe(false);

    eng.setPrefs({ sectionEventActionsEnabled: true });
    expect(eng.mayRunSectionEventAction(confirmed)).toBe(true);
    expect(eng.mayRunSectionEventAction(inferred)).toBe(false);
  });
});
