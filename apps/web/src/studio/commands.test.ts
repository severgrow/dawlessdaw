/**
 * Studio commands facade — panic / setRoute / captureRecentBars.
 */

import { describe, expect, it, vi } from 'vitest';
import type { MidiRoute } from '@dawlessdaw/routing';
import type { CaptureLastNBarsResult } from '@dawlessdaw/midi';
import { createStudioCommands } from './commands';

function route(id: string, enabled = true): MidiRoute {
  return {
    id,
    name: id,
    enabled,
    sourcePortId: 'in',
    destinations: [{ portId: 'out' }],
    forwardClock: false,
  };
}

function emptyCapture(bars: number): CaptureLastNBarsResult {
  return {
    honesty: 'experimental',
    requestedBars: bars,
    actualInterval: {
      kind: 'wall-ms',
      requestedBars: bars,
      bars: null,
      startTickCount: null,
      endTickCount: null,
      startMs: 0,
      endMs: 1000,
      durationMs: 1000,
    },
    clock: {
      bpm: null,
      confidence: 'Unknown',
      status: null,
      barAligned: false,
      transport: null,
      endBar: null,
      endBeat: null,
      endTickCount: null,
    },
    sources: [],
    events: [],
    quality: 'empty',
    limitations: ['test'],
  };
}

describe('StudioCommands', () => {
  it('lists panic, setRoute, captureRecentBars', () => {
    const cmds = createStudioCommands({
      panic: () => {},
      getRoutes: () => [],
      setRoutes: () => {},
      captureRecentBars: () => emptyCapture(8),
    });
    expect(cmds.list()).toContain('panic');
    expect(cmds.list()).toContain('setRoute');
    expect(cmds.list()).toContain('captureRecentBars');
  });

  it('panic delegates without SysEx claim path', () => {
    const panic = vi.fn();
    const cmds = createStudioCommands({
      panic,
      getRoutes: () => [],
      setRoutes: () => {},
      captureRecentBars: () => emptyCapture(8),
    });
    const r = cmds.panic();
    expect(panic).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.note).toMatch(/no SysEx/i);
  });

  it('setRoute upserts by id and preserves other routes', () => {
    let routes: MidiRoute[] = [route('a'), route('b')];
    const cmds = createStudioCommands({
      panic: () => {},
      getRoutes: () => routes,
      setRoutes: (next) => {
        routes = next;
      },
      captureRecentBars: () => emptyCapture(8),
    });
    const updated = { ...route('b'), name: 'B2', forwardClock: false };
    expect(cmds.setRoute(updated).ok).toBe(true);
    expect(routes).toHaveLength(2);
    expect(routes.find((r) => r.id === 'b')?.name).toBe('B2');
    expect(routes.find((r) => r.id === 'a')?.forwardClock).toBe(false);

    expect(cmds.setRoute(route('c')).ok).toBe(true);
    expect(routes.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('enableRoute toggles without rewriting engines', () => {
    let routes: MidiRoute[] = [route('a', true)];
    const cmds = createStudioCommands({
      panic: () => {},
      getRoutes: () => routes,
      setRoutes: (next) => {
        routes = next;
      },
      captureRecentBars: () => emptyCapture(8),
    });
    cmds.enableRoute('a', false);
    expect(routes[0]!.enabled).toBe(false);
  });

  it('captureRecentBars is observation-only and validates bar count', () => {
    const capture = vi.fn((n: number) => emptyCapture(n));
    const cmds = createStudioCommands({
      panic: () => {},
      getRoutes: () => [],
      setRoutes: () => {},
      captureRecentBars: capture,
    });
    const ok = cmds.captureRecentBars(8);
    expect(ok.ok).toBe(true);
    expect(capture).toHaveBeenCalledWith(8);

    const bad = cmds.captureRecentBars(3);
    expect(bad.ok).toBe(false);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('execute dispatches known ids and fails closed on unknown', () => {
    const panic = vi.fn();
    const cmds = createStudioCommands({
      panic,
      getRoutes: () => [],
      setRoutes: () => {},
      captureRecentBars: () => emptyCapture(4),
    });
    expect(cmds.execute('panic').ok).toBe(true);
    expect(panic).toHaveBeenCalledOnce();
    const unknown = cmds.execute('flashFirmware');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toMatch(/unknown/i);
  });
});
