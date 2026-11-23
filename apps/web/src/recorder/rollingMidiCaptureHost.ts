/**
 * Host wiring for RollingMidiCapture — observation only.
 * Listens to bus midi:in / midi:out; clock context from shared ClockService.
 * Never sends MIDI or changes routes/clock-forward.
 */
import {
  CAPTURE_BAR_OPTIONS,
  RollingMidiCapture,
  type CaptureBarCount,
  type CaptureClockHint,
  type CaptureLastNBarsResult,
  type MidiRecorderPosition,
} from '@dawlessdaw/midi';
import { captureHintFromClockService, type ClockService } from '@dawlessdaw/sequencer';
import { getStudioRuntime } from '../studio/runtime';

export { CAPTURE_BAR_OPTIONS };
export type { CaptureBarCount, CaptureLastNBarsResult };

const BARS_KEY = 'dawlessdaw.captureLastBars';

let shared: RollingMidiCapture | null = null;
let unsubs: Array<() => void> = [];
let listening = false;

function clock(): ClockService {
  return getStudioRuntime().getClockService();
}

function positionFromClock(): MidiRecorderPosition | null {
  const mt = clock().getMusicalTime();
  if (!mt) return null;
  return {
    bar: mt.bar,
    beat: mt.beat,
    tickCount: mt.tickCount,
    transport: mt.transport,
  };
}

export function getRollingMidiCapture(): RollingMidiCapture {
  if (!shared) {
    shared = new RollingMidiCapture({
      eventCapacity: 4096,
      maxBytes: 512 * 1024,
      getPosition: positionFromClock,
    });
  }
  return shared;
}

/** Start passive bus listen (idempotent). Safe if MIDI not yet started. */
export function ensureRollingMidiCaptureListening(): void {
  if (listening) return;
  const roll = getRollingMidiCapture();
  roll.start();
  const runtime = getStudioRuntime();
  unsubs.push(
    runtime.bus.on('midi:in', (ev) => {
      if (ev.type !== 'midi:in') return;
      roll.observeIncoming(ev.message);
    }),
  );
  unsubs.push(
    runtime.bus.on('midi:out', (ev) => {
      if (ev.type !== 'midi:out') return;
      roll.observeOutbound(ev.message, {
        routeId: ev.routeId,
        portId: ev.message.portId,
      });
    }),
  );
  listening = true;
}

export function buildCaptureClockHint(svc?: ClockService): CaptureClockHint {
  const hint = captureHintFromClockService(svc ?? clock());
  return {
    confidence: hint.confidence,
    status: hint.status,
    bpm: hint.bpm,
    clockDetected: hint.clockDetected,
    position: hint.position,
  };
}

export function captureLastBars(bars: CaptureBarCount): CaptureLastNBarsResult {
  ensureRollingMidiCaptureListening();
  return getRollingMidiCapture().captureLastBars(bars, buildCaptureClockHint());
}

export function loadPersistedCaptureBars(): CaptureBarCount {
  try {
    const raw = Number(localStorage.getItem(BARS_KEY));
    if ((CAPTURE_BAR_OPTIONS as readonly number[]).includes(raw)) {
      return raw as CaptureBarCount;
    }
  } catch {
    /* ignore */
  }
  return 8;
}

export function persistCaptureBars(n: CaptureBarCount): void {
  try {
    localStorage.setItem(BARS_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function formatCaptureResultLine(r: CaptureLastNBarsResult): string {
  const q =
    r.quality === 'bar-aligned'
      ? 'bars'
      : r.quality === 'approximate'
        ? 'approx'
        : r.quality;
  const bpm = r.clock.bpm != null ? `${Math.round(r.clock.bpm)}bpm` : 'no bpm';
  return `${r.events.length} ev · ${q} · ${bpm} · ${r.sources.length} src`;
}
