import type { DeviceId, MidiMessage, FocusState, SceneId, SessionId } from '@dawlessdaw/core';
import { isClockLike } from '@dawlessdaw/core';

export type StudioEvent =
  | { type: 'midi:in'; message: MidiMessage; deviceId?: DeviceId }
  | { type: 'midi:out'; message: MidiMessage; deviceId?: DeviceId; routeId?: string }
  | { type: 'midi:clock'; message: MidiMessage; deviceId?: DeviceId }
  | { type: 'device:connected'; deviceId: DeviceId }
  | { type: 'device:disconnected'; deviceId: DeviceId }
  | { type: 'focus:changed'; focus: FocusState; reason: string }
  | { type: 'route:fired'; routeId: string; fromPortId: string; toPortId: string }
  | { type: 'scene:recalled'; sceneId: SceneId }
  | { type: 'session:loaded'; sessionId: SessionId }
  | { type: 'simulation:tick'; index: number }
  | { type: 'studio:status'; message: string; level: 'info' | 'warn' | 'error' };

export type StudioEventType = StudioEvent['type'];

export type StudioEventHandler = (event: StudioEvent) => void;

export interface EventBusOptions {
  /** Max retained non-clock events in history. Default 500. */
  historyLimit?: number;
  /** Max retained clock events (separate ring). Default 32. */
  clockHistoryLimit?: number;
}

/**
 * Typed studio event bus with bounded history.
 * Clock ticks are partitioned so UI subscribers are not flooded.
 */
export class StudioEventBus {
  private listeners = new Map<StudioEventType | '*', Set<StudioEventHandler>>();
  private history: StudioEvent[] = [];
  private clockHistory: StudioEvent[] = [];
  private readonly historyLimit: number;
  private readonly clockHistoryLimit: number;
  private seq = 0;

  constructor(options: EventBusOptions = {}) {
    this.historyLimit = options.historyLimit ?? 500;
    this.clockHistoryLimit = options.clockHistoryLimit ?? 32;
  }

  on(type: StudioEventType | '*', handler: StudioEventHandler): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Subscribe to UI-safe events (excludes midi:clock). */
  onUi(handler: StudioEventHandler): () => void {
    return this.on('*', (event) => {
      if (event.type === 'midi:clock') return;
      handler(event);
    });
  }

  emit(event: StudioEvent): void {
    this.seq += 1;
    const isClock =
      event.type === 'midi:clock' ||
      (event.type === 'midi:in' && isClockLike(event.message.kind)) ||
      (event.type === 'midi:out' && isClockLike(event.message.kind));

    if (isClock) {
      // Normalize clock-like midi:in/out into midi:clock only.
      // Do not re-dispatch the original to '*' — onUi would flood at ~24 PPQN
      // and stall Start/clock forwarding through the app.
      const clockEvent: StudioEvent =
        event.type === 'midi:clock'
          ? event
          : {
              type: 'midi:clock',
              message: (event as Extract<StudioEvent, { type: 'midi:in' | 'midi:out' }>).message,
              deviceId: (event as Extract<StudioEvent, { type: 'midi:in' | 'midi:out' }>).deviceId,
            };
      this.pushBounded(this.clockHistory, clockEvent, this.clockHistoryLimit);
      this.dispatch('midi:clock', clockEvent);
      // Typed midi:clock subscribers only (routing listens on the transport, not '*')
      return;
    }

    this.pushBounded(this.history, event, this.historyLimit);
    this.dispatch(event.type, event);
    this.dispatch('*', event);
  }

  getHistory(): readonly StudioEvent[] {
    return this.history;
  }

  getClockHistory(): readonly StudioEvent[] {
    return this.clockHistory;
  }

  getSeq(): number {
    return this.seq;
  }

  clear(): void {
    this.history = [];
    this.clockHistory = [];
  }

  private dispatch(type: StudioEventType | '*', event: StudioEvent): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (err) {
        console.error('[StudioEventBus] handler error', err);
      }
    }
  }

  private pushBounded(arr: StudioEvent[], event: StudioEvent, limit: number): void {
    arr.push(event);
    if (arr.length > limit) {
      arr.splice(0, arr.length - limit);
    }
  }
}
