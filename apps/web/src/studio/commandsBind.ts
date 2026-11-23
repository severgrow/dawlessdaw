/**
 * Bind StudioCommands to the live StudioRuntime + rolling capture host.
 * Kept separate from runtime.ts to avoid import cycles.
 */
import { captureLastBars } from '../recorder/rollingMidiCaptureHost';
import { getStudioRuntime } from './runtime';
import { createStudioCommands, type StudioCommands } from './commands';

let cached: StudioCommands | null = null;

/** Singleton facade — UI and future HW should call through here. */
export function getStudioCommands(): StudioCommands {
  if (!cached) {
    const runtime = getStudioRuntime();
    cached = createStudioCommands({
      panic: () => {
        runtime.panic();
      },
      getRoutes: () => runtime.getSnapshot().routes,
      setRoutes: (routes) => {
        runtime.setRoutes(routes);
      },
      captureRecentBars: (bars) => captureLastBars(bars),
    });
  }
  return cached;
}

/** Test helper — reset cached facade after deps change. */
export function resetStudioCommandsForTests(): void {
  cached = null;
}
