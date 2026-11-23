/**
 * Studio commands facade (plan step 11).
 *
 * Small callable surface for UI now and future HW later. Wraps existing
 * engines — does not rewrite routing/capture. Capture is observation-only.
 * Never enables app clock forwarding; never sends SysEx.
 */

import type { MidiRoute } from '@dawlessdaw/routing';
import {
  CAPTURE_BAR_OPTIONS,
  type CaptureBarCount,
  type CaptureLastNBarsResult,
} from '@dawlessdaw/midi';

export const STUDIO_COMMAND_IDS = [
  'panic',
  'setRoute',
  'setRoutes',
  'enableRoute',
  'captureRecentBars',
] as const;

export type StudioCommandId = (typeof STUDIO_COMMAND_IDS)[number];

export interface StudioCommandOk<T = unknown> {
  ok: true;
  command: StudioCommandId;
  data?: T;
}

export interface StudioCommandErr {
  ok: false;
  command: StudioCommandId | string;
  error: string;
}

export type StudioCommandResult<T = unknown> = StudioCommandOk<T> | StudioCommandErr;

export interface StudioCommandsDeps {
  /** Safe panic — All Notes Off / All Sound Off only (no SysEx). */
  panic: () => void;
  getRoutes: () => readonly MidiRoute[];
  setRoutes: (routes: MidiRoute[]) => void;
  /** Observation-only MIDI rolling capture. */
  captureRecentBars: (bars: CaptureBarCount) => CaptureLastNBarsResult;
}

function isCaptureBarCount(n: number): n is CaptureBarCount {
  return (CAPTURE_BAR_OPTIONS as readonly number[]).includes(n);
}

/**
 * Callable studio ops. Prefer this over reaching into engines from UI / HW.
 */
export class StudioCommands {
  constructor(private readonly deps: StudioCommandsDeps) {}

  list(): readonly StudioCommandId[] {
    return STUDIO_COMMAND_IDS;
  }

  panic(): StudioCommandResult<{ note: string }> {
    try {
      this.deps.panic();
      return {
        ok: true,
        command: 'panic',
        data: { note: 'All Notes Off / All Sound Off — no SysEx' },
      };
    } catch (e) {
      return {
        ok: false,
        command: 'panic',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Upsert a single route by id (replace if present, append otherwise).
   * Does not mutate forwardClock defaults on other routes.
   */
  setRoute(route: MidiRoute): StudioCommandResult<{ routeId: string }> {
    try {
      if (!route?.id) {
        return { ok: false, command: 'setRoute', error: 'route.id required' };
      }
      const current = [...this.deps.getRoutes()];
      const idx = current.findIndex((r) => r.id === route.id);
      if (idx >= 0) current[idx] = route;
      else current.push(route);
      this.deps.setRoutes(current);
      return { ok: true, command: 'setRoute', data: { routeId: route.id } };
    } catch (e) {
      return {
        ok: false,
        command: 'setRoute',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  setRoutes(routes: MidiRoute[]): StudioCommandResult<{ count: number }> {
    try {
      this.deps.setRoutes(routes);
      return { ok: true, command: 'setRoutes', data: { count: routes.length } };
    } catch (e) {
      return {
        ok: false,
        command: 'setRoutes',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  enableRoute(id: string, enabled: boolean): StudioCommandResult<{ routeId: string; enabled: boolean }> {
    try {
      const routes = this.deps.getRoutes().map((r) =>
        r.id === id ? { ...r, enabled } : r,
      );
      this.deps.setRoutes(routes);
      return { ok: true, command: 'enableRoute', data: { routeId: id, enabled } };
    } catch (e) {
      return {
        ok: false,
        command: 'enableRoute',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Capture last N bars from the rolling MIDI buffer (observation only).
   * Default 8 bars. Does not enable app clock forwarding.
   */
  captureRecentBars(
    bars: CaptureBarCount | number = 8,
  ): StudioCommandResult<CaptureLastNBarsResult> {
    try {
      const n = typeof bars === 'number' ? bars : 8;
      if (!isCaptureBarCount(n)) {
        return {
          ok: false,
          command: 'captureRecentBars',
          error: `bars must be one of ${CAPTURE_BAR_OPTIONS.join('/')}`,
        };
      }
      const data = this.deps.captureRecentBars(n);
      return { ok: true, command: 'captureRecentBars', data };
    } catch (e) {
      return {
        ok: false,
        command: 'captureRecentBars',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Generic dispatcher for future HW / assistant bindings.
   * Unknown ids fail closed without side effects.
   */
  execute(
    command: StudioCommandId | string,
    args?: Record<string, unknown>,
  ): StudioCommandResult {
    switch (command) {
      case 'panic':
        return this.panic();
      case 'setRoute':
        return this.setRoute(args?.route as MidiRoute);
      case 'setRoutes':
        return this.setRoutes((args?.routes as MidiRoute[]) ?? []);
      case 'enableRoute':
        return this.enableRoute(String(args?.id ?? ''), Boolean(args?.enabled));
      case 'captureRecentBars': {
        const bars = args?.bars;
        return this.captureRecentBars(
          typeof bars === 'number' ? bars : 8,
        );
      }
      default:
        return {
          ok: false,
          command,
          error: `unknown command: ${command}`,
        };
    }
  }
}

export function createStudioCommands(deps: StudioCommandsDeps): StudioCommands {
  return new StudioCommands(deps);
}
