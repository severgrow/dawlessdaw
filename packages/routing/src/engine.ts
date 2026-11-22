import type { MidiMessage, PortId } from '@dawlessdaw/core';
import {
  buildCc,
  buildNoteOff,
  buildNoteOn,
  cloneMidiData,
  isClockLike,
  parseMidiMessage,
} from '@dawlessdaw/core';
import type { StudioEventBus } from '@dawlessdaw/events';
import type { HardwareTransport } from '@dawlessdaw/midi';
import type { ActiveNoteKey, MidiRoute, RoutingPreset } from './types';

function noteKey(destPortId: PortId, channel: number, note: number): string {
  return `${destPortId}:${channel}:${note}`;
}

/**
 * MIDI routing engine with multi-dest, transforms, feedback prevention,
 * note-off cleanup, and separate clock authority.
 */
export class MidiRoutingEngine {
  private routes: MidiRoute[] = [];
  private clockAuthorityPortId: PortId | null = null;
  private activeNotes = new Map<string, ActiveNoteKey>();
  /** Last Program Change sent from a knob, per dest port + channel. */
  private lastKnobProgram = new Map<string, number>();
  /** Ports that recently received our output — suppress echo. */
  private recentOut = new Map<PortId, number>();
  private feedbackWindowMs = 8;
  private unsub: (() => void) | null = null;

  constructor(
    private transport: HardwareTransport,
    private bus?: StudioEventBus,
  ) {}

  start(): void {
    this.unsub = this.transport.onMessage((msg) => this.handleIncoming(msg));
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    this.allNotesOff();
  }

  setRoutes(routes: MidiRoute[]): void {
    this.lastKnobProgram.clear();
    this.routes = routes.map((r) => ({
      ...r,
      destinations: r.destinations.map((d) => ({ ...d })),
    }));
  }

  getRoutes(): MidiRoute[] {
    return this.routes.map((r) => ({
      ...r,
      destinations: r.destinations.map((d) => ({ ...d })),
    }));
  }

  setClockAuthority(portId: PortId | null): void {
    this.clockAuthorityPortId = portId;
  }

  getClockAuthority(): PortId | null {
    return this.clockAuthorityPortId;
  }

  applyPreset(preset: RoutingPreset): void {
    this.setRoutes(preset.routes);
    this.setClockAuthority(preset.clockAuthorityPortId);
  }

  exportPreset(id: string, name: string): RoutingPreset {
    return {
      id,
      name,
      routes: this.getRoutes(),
      clockAuthorityPortId: this.clockAuthorityPortId,
    };
  }

  enableRoute(id: string, enabled: boolean): void {
    const route = this.routes.find((r) => r.id === id);
    if (route) route.enabled = enabled;
  }

  handleIncoming(message: MidiMessage): void {
    // Feedback loop prevention
    const lastOut = this.recentOut.get(message.portId);
    if (lastOut !== undefined && message.timestamp - lastOut < this.feedbackWindowMs) {
      return;
    }

    // Studio rule: the app never sends SysEx (or unparsed bytes) to any device.
    if (message.kind === 'sysex' || message.kind === 'unknown') return;

    const clockLike = isClockLike(message.kind);

    for (const route of this.routes) {
      if (!route.enabled) continue;
      if (route.sourcePortId !== message.portId) continue;

      if (clockLike) {
        if (route.forwardClock === false) continue;
        // Only the clock authority source may forward clock (if set)
        if (
          this.clockAuthorityPortId !== null &&
          message.portId !== this.clockAuthorityPortId
        ) {
          continue;
        }
      }

      if (route.blockKinds?.includes(message.kind)) continue;

      // Channel filter — never apply to system realtime / song-position (no channel).
      // A channel-filtered route only carries channel messages.
      if (!clockLike && route.channel?.allow?.length) {
        if (message.channel === undefined) continue;
        if (!route.channel.allow.includes(message.channel)) continue;
      }

      for (const dest of route.destinations) {
        if (dest.enabled === false) continue;
        // Never route back to same port
        if (dest.portId === message.portId) continue;

        const transformed = this.transform(message, route, dest.portId);
        if (!transformed) continue;

        this.sendOut(dest.portId, transformed, route.id);
      }
    }
  }

  /** Force-send note-offs for all tracked sounding notes. */
  allNotesOff(): void {
    for (const [, key] of this.activeNotes) {
      const data = buildNoteOff(key.channel, key.note, 0);
      this.rawSend(key.destPortId, data);
    }
    this.activeNotes.clear();
  }

  private transform(
    message: MidiMessage,
    route: MidiRoute,
    destPortId: PortId,
  ): Uint8Array | null {
    if (isClockLike(message.kind)) {
      return cloneMidiData(message.data);
    }

    let channel = message.channel ?? 1;
    if (route.channel?.remap && route.channel.remap[channel] !== undefined) {
      channel = route.channel.remap[channel]!;
    }

    if (message.kind === 'note-on' || message.kind === 'note-off') {
      let note = message.note ?? 0;
      if (route.note?.map && route.note.map[note] !== undefined) {
        note = route.note.map[note]!;
      }
      if (route.note?.transpose) {
        note = clamp(note + route.note.transpose, 0, 127);
      }
      let velocity = message.velocity ?? 0;
      if (message.kind === 'note-on' && velocity > 0) {
        const scale = route.velocity?.scale ?? 1;
        const offset = route.velocity?.offset ?? 0;
        velocity = clamp(Math.round(velocity * scale + offset), 1, 127);
      }
      return message.kind === 'note-on' && (message.velocity ?? 0) > 0
        ? buildNoteOn(channel, note, velocity)
        : buildNoteOff(channel, note, velocity);
    }

    if (message.kind === 'cc') {
      let controller = message.controller ?? 0;
      const toPc = route.cc?.toProgramChange;
      if (toPc && controller === toPc.controller) {
        const steps = clamp(Math.floor(toPc.steps), 1, 128);
        const program = Math.min(steps - 1, Math.floor(((message.value ?? 0) * steps) / 128));
        const key = `${destPortId}:${channel}`;
        if (this.lastKnobProgram.get(key) === program) return null;
        this.lastKnobProgram.set(key, program);
        return new Uint8Array([0xc0 | ((channel - 1) & 0x0f), program]);
      }
      if (route.cc?.dropUnmapped && route.cc.map?.[controller] === undefined) {
        return null;
      }
      if (route.cc?.map && route.cc.map[controller] !== undefined) {
        controller = route.cc.map[controller]!;
      }
      let value = message.value ?? 0;
      if (route.cc?.range) {
        value = clamp(value, route.cc.range.min, route.cc.range.max);
      }
      return buildCc(channel, controller, value);
    }

    // Remap channel nibble for other channel voice messages
    const data = cloneMidiData(message.data);
    if (data.length > 0 && data[0]! >= 0x80 && data[0]! <= 0xef) {
      data[0] = (data[0]! & 0xf0) | ((channel - 1) & 0x0f);
    }
    return data;
  }

  private sendOut(portId: PortId, data: Uint8Array, routeId: string): void {
    this.rawSend(portId, data);

    const parsedKind = data[0]!;
    const isNoteOn = (parsedKind & 0xf0) === 0x90 && (data[2] ?? 0) > 0;
    const isNoteOff =
      (parsedKind & 0xf0) === 0x80 || ((parsedKind & 0xf0) === 0x90 && (data[2] ?? 0) === 0);

    if (isNoteOn || isNoteOff) {
      const channel = (parsedKind & 0x0f) + 1;
      const note = data[1] ?? 0;
      const key = noteKey(portId, channel, note);
      if (isNoteOn) {
        this.activeNotes.set(key, { destPortId: portId, channel, note });
      } else {
        this.activeNotes.delete(key);
      }
    }

    this.bus?.emit({
      type: 'route:fired',
      routeId,
      fromPortId: '',
      toPortId: portId,
    });
  }

  private rawSend(portId: PortId, data: Uint8Array): void {
    const ts = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.recentOut.set(portId, ts);
    const status = data[0] ?? 0;
    const realtime = status >= 0xf8 && status <= 0xff;
    // Omit timestamp for system realtime so Web MIDI sends immediately (Start/Clock).
    if (realtime) this.transport.send(portId, data);
    else this.transport.send(portId, data, ts);
    // Parse kind so outbound clock/start/stop partition into midi:clock (not UI flood)
    this.bus?.emit({
      type: 'midi:out',
      message: parseMidiMessage(data, ts, portId),
    });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
