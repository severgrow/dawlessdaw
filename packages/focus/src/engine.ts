import type { DeviceId, FocusMode, FocusState, MidiMessage } from '@nervos/core';
import { isClockLike } from '@nervos/core';
import type { StudioEventBus } from '@nervos/events';

export interface FocusEngineOptions {
  /** Minimum ms between automatic focus changes (hysteresis). Default 400. */
  hysteresisMs?: number;
  /** Soft-focus duration after a brief secondary activity. Default 800. */
  softFocusMs?: number;
  /** Smart mode: require this many non-clock events within window. Default 2. */
  smartThreshold?: number;
  /** Smart mode activity window ms. Default 600. */
  smartWindowMs?: number;
}

export interface FocusActivity {
  deviceId: DeviceId;
  message: MidiMessage;
  at: number;
}

/**
 * Focus Engine — Follow / Smart / Manual with pin, soft focus, hysteresis.
 * Clock and sequencer transport messages never thrash focus.
 */
export class FocusEngine {
  private state: FocusState = {
    mode: 'follow',
    activeDeviceId: null,
    pinnedDeviceId: null,
    softFocus: null,
    lastChangeAt: 0,
  };

  private readonly hysteresisMs: number;
  private readonly softFocusMs: number;
  private readonly smartThreshold: number;
  private readonly smartWindowMs: number;
  private activityLog: { deviceId: DeviceId; at: number }[] = [];
  private deviceByPort = new Map<string, DeviceId>();

  constructor(
    private bus?: StudioEventBus,
    options: FocusEngineOptions = {},
  ) {
    this.hysteresisMs = options.hysteresisMs ?? 400;
    this.softFocusMs = options.softFocusMs ?? 800;
    this.smartThreshold = options.smartThreshold ?? 2;
    this.smartWindowMs = options.smartWindowMs ?? 600;
  }

  getState(): FocusState {
    return { ...this.state, softFocus: this.state.softFocus ? { ...this.state.softFocus } : null };
  }

  setMode(mode: FocusMode): void {
    this.state.mode = mode;
    if (mode === 'manual' && !this.state.pinnedDeviceId && this.state.activeDeviceId) {
      this.state.pinnedDeviceId = this.state.activeDeviceId;
    }
    this.emit('mode-change');
  }

  pin(deviceId: DeviceId | null, now = Date.now()): void {
    this.state.pinnedDeviceId = deviceId;
    if (deviceId) {
      this.forceFocus(deviceId, 'pin', now);
      this.state.mode = 'manual';
    }
    this.emit('pin');
  }

  /** Manual select without necessarily pinning. */
  select(deviceId: DeviceId, now = Date.now()): void {
    this.forceFocus(deviceId, 'manual-select', now);
  }

  mapPort(portId: string, deviceId: DeviceId): void {
    this.deviceByPort.set(portId, deviceId);
  }

  clearPortMaps(): void {
    this.deviceByPort.clear();
  }

  /**
   * Ingest MIDI activity. Returns whether focus changed.
   * Clock / transport never causes focus change.
   */
  onMidi(message: MidiMessage, deviceId?: DeviceId, now = Date.now()): boolean {
    if (isClockLike(message.kind)) {
      return false;
    }

    const resolved =
      deviceId ?? this.deviceByPort.get(message.portId) ?? null;
    if (!resolved) return false;

    // Expire soft focus
    if (this.state.softFocus && this.state.softFocus.until <= now) {
      this.state.softFocus = null;
    }

    if (this.state.mode === 'manual' || this.state.pinnedDeviceId) {
      // Soft focus can still track secondary activity while pinned
      if (
        this.state.activeDeviceId &&
        resolved !== this.state.activeDeviceId &&
        resolved !== this.state.pinnedDeviceId
      ) {
        this.state.softFocus = { deviceId: resolved, until: now + this.softFocusMs };
        this.emit('soft-focus');
      }
      return false;
    }

    this.activityLog.push({ deviceId: resolved, at: now });
    this.activityLog = this.activityLog.filter((a) => now - a.at <= this.smartWindowMs);

    if (this.state.mode === 'follow') {
      return this.tryFocus(resolved, now, 'follow');
    }

    // smart
    const count = this.activityLog.filter((a) => a.deviceId === resolved).length;
    if (count >= this.smartThreshold) {
      return this.tryFocus(resolved, now, 'smart');
    }

    // Below threshold: soft focus only
    if (resolved !== this.state.activeDeviceId) {
      this.state.softFocus = { deviceId: resolved, until: now + this.softFocusMs };
      this.emit('soft-focus');
    }
    return false;
  }

  private tryFocus(deviceId: DeviceId, now: number, reason: string): boolean {
    if (this.state.activeDeviceId === deviceId) {
      this.state.softFocus = null;
      return false;
    }
    if (
      this.state.activeDeviceId &&
      now >= this.state.lastChangeAt &&
      now - this.state.lastChangeAt < this.hysteresisMs
    ) {
      // Within hysteresis: soft-focus the candidate instead of thrashing
      this.state.softFocus = { deviceId, until: now + this.softFocusMs };
      this.emit('hysteresis-soft');
      return false;
    }
    return this.forceFocus(deviceId, reason, now);
  }

  private forceFocus(deviceId: DeviceId, reason: string, now = Date.now()): boolean {
    this.state.activeDeviceId = deviceId;
    this.state.lastChangeAt = now;
    this.state.softFocus = null;
    this.emit(reason);
    return true;
  }

  private emit(reason: string): void {
    this.bus?.emit({
      type: 'focus:changed',
      focus: this.getState(),
      reason,
    });
  }
}
