import { describe, it, expect } from 'vitest';
import {
  buildDirectSequencingRoutes,
  defaultCircuitArrangerProfile,
  resolveSceneForProject,
} from './arranger';
import {
  decodeProjectProgramChange,
  encodeProjectProgramChange,
  trackFromChannel,
} from './midi-map';
import { CircuitRhythmInterpreter } from './interpreter';
import { parseMidiMessage } from '@dawlessdaw/core';

describe('Circuit Rhythm MIDI map (Confirmed docs)', () => {
  it('decodes instant and queued project program changes', () => {
    expect(decodeProjectProgramChange(0)).toEqual({
      projectIndex: 1,
      kind: 'instant',
    });
    expect(decodeProjectProgramChange(63)).toEqual({
      projectIndex: 64,
      kind: 'instant',
    });
    expect(decodeProjectProgramChange(64)).toEqual({
      projectIndex: 1,
      kind: 'queued',
    });
    expect(encodeProjectProgramChange(2, 'queued')).toBe(65);
  });

  it('maps default channels to tracks', () => {
    expect(trackFromChannel(5)).toBe(5);
    expect(trackFromChannel(16)).toBeNull();
  });
});

describe('CircuitRhythmInterpreter', () => {
  it('classifies clock as background', () => {
    const i = new CircuitRhythmInterpreter();
    const msg = parseMidiMessage(new Uint8Array([0xf8]), 0, 'p');
    expect(i.interpret(msg).gesture).toBe('background');
    expect(i.interpret(msg).focusWorthy).toBe(false);
  });

  it('classifies project PGM on ch16 as arrangement', () => {
    const i = new CircuitRhythmInterpreter();
    // Program change ch16 = 0xCF, program 1 → project 2 instant
    const msg = parseMidiMessage(new Uint8Array([0xcf, 1]), 10, 'mock-circuit-in');
    const out = i.interpret(msg);
    expect(out.gesture).toBe('arrangement');
    expect(out.projectIndex).toBe(2);
    expect(out.projectChangeKind).toBe('instant');
    expect(out.focusWorthy).toBe(false);
  });

  it('classifies macro CC as performer-gesture', () => {
    const i = new CircuitRhythmInterpreter();
    const msg = parseMidiMessage(new Uint8Array([0xb0, 21, 64]), 20, 'p');
    const out = i.interpret(msg);
    expect(out.gesture).toBe('performer-gesture');
    expect(out.focusWorthy).toBe(true);
    expect(out.track).toBe(1);
  });

  it('infers sequencer-stream under dense notes', () => {
    const i = new CircuitRhythmInterpreter(undefined, {
      streamWindowMs: 400,
      streamThreshold: 4,
    });
    for (let n = 0; n < 4; n++) {
      const msg = parseMidiMessage(new Uint8Array([0x90, 36, 100]), n * 10, 'p');
      const out = i.interpret(msg, n * 10);
      if (n === 3) expect(out.gesture).toBe('sequencer-stream');
    }
  });
});

describe('Circuit arranger routes', () => {
  it('builds direct-sequencing multi-dest routes without scene sync claims', () => {
    const profile = defaultCircuitArrangerProfile('device:circuit-rhythm', 'mock-circuit-in', {
      spOut: 'mock-sp404-out',
      mpcOut: 'mock-mpc-out',
      fm1Out: 'mock-fm1-out',
    });
    const routes = buildDirectSequencingRoutes(profile);
    expect(routes.some((r) => r.id === 'circuit-arranger-t1')).toBe(true);
    expect(routes.some((r) => r.id === 'circuit-arranger-clock')).toBe(true);
    const drums = routes.find((r) => r.id === 'circuit-arranger-t1')!;
    expect(drums.channel?.allow).toEqual([1]);
    expect(drums.destinations[0]?.portId).toBe('mock-sp404-out');
    expect(routes.every((r) => r.forwardClock !== true || r.id.includes('clock'))).toBe(true);
  });

  it('resolves project → scene map', () => {
    expect(
      resolveSceneForProject(
        [
          { projectIndex: 1, sceneId: 'scene-a' },
          { projectIndex: 3, sceneId: 'scene-b' },
        ],
        3,
      ),
    ).toBe('scene-b');
    expect(resolveSceneForProject([], 1)).toBeNull();
  });
});
