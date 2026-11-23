/**
 * Headless MIDI event recorder (MMT-8 Step 4 / plan step 7).
 *
 * Observation only: callers push already-seen messages. Never sends MIDI,
 * never touches HardwareTransport or MidiRoutingEngine, never enables
 * app clock forwarding. Incoming vs routed-outbound are separate APIs so
 * the same bytes are not double-counted when both edges are observed.
 *
 * Ideas only from MMT-8 behavioural recording — no firmware / emulator /
 * fixture copy.
 */

import { cloneMidiData, isClockLike, type MidiMessage, type MidiMessageKind, type PortId } from '@dawlessdaw/core';

/** Compact musical position when a clock authority is known. */
export interface MidiRecorderPosition {
  bar: number;
  beat: number;
  tickCount: number;
  transport: 'stopped' | 'playing' | 'paused';
}

export type MidiEventSourceKind = 'incoming' | 'outbound';

export interface MidiEventSource {
  kind: MidiEventSourceKind;
  portId: PortId;
  /** Optional route id when recording routed outbound. */
  routeId?: string;
}

export interface RecordedMidiEvent {
  /** Monotonic sequence (1-based within a recorder lifetime). */
  seq: number;
  /** Wall / performance ms (from message or injected now). */
  atMs: number;
  source: MidiEventSource;
  kind: MidiMessageKind;
  channel?: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  /** Copied bytes — safe to retain after the live buffer moves on. */
  data: Uint8Array;
  /** Musical position when getPosition provided a snapshot; else null. */
  position: MidiRecorderPosition | null;
  /**
   * Transport metadata for Start / Stop / Continue / song-position.
   * Raw F8 clock ticks are omitted by default (see recordClockTicks).
   */
  transportMeta: 'start' | 'stop' | 'continue' | 'song-position' | 'clock' | null;
}

export interface MidiEventRecorderOptions {
  /** Max retained events (oldest dropped). Default 4096. */
  capacity?: number;
  /** Clock for events missing a timestamp. */
  now?: () => number;
  /** Optional musical position when a clock authority is known. */
  getPosition?: () => MidiRecorderPosition | null;
  /**
   * When false (default), skip raw MIDI clock (F8) bytes — Start/Stop/Continue
   * and song-position still record. Keeps the ring bounded under dense clock.
   */
  recordClockTicks?: boolean;
}

export interface MidiEventRecorderSnapshot {
  honesty: 'experimental';
  recording: boolean;
  capacity: number;
  size: number;
  dropped: number;
  events: readonly RecordedMidiEvent[];
}

const DEFAULT_CAPACITY = 4096;

const CHANNEL_VOICE: ReadonlySet<MidiMessageKind> = new Set([
  'note-on',
  'note-off',
  'cc',
  'program-change',
  'pitch-bend',
  'aftertouch',
]);

function transportMetaFor(kind: MidiMessageKind): RecordedMidiEvent['transportMeta'] {
  switch (kind) {
    case 'start':
      return 'start';
    case 'stop':
      return 'stop';
    case 'continue':
      return 'continue';
    case 'song-position':
      return 'song-position';
    case 'clock':
      return 'clock';
    default:
      return null;
  }
}

function shouldRecord(kind: MidiMessageKind, recordClockTicks: boolean): boolean {
  if (kind === 'clock') return recordClockTicks;
  if (CHANNEL_VOICE.has(kind)) return true;
  if (isClockLike(kind)) return true; // start/stop/continue/song-position
  return false; // sysex / unknown — out of scope for this recorder
}

/**
 * Bounded, timestamped MIDI event ring. Push-only; no side effects on routing.
 */
export class MidiEventRecorder {
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly getPosition: (() => MidiRecorderPosition | null) | null;
  private readonly recordClockTicks: boolean;
  private buf: RecordedMidiEvent[] = [];
  private seq = 0;
  private dropped = 0;
  private recording = false;
  private cached: readonly RecordedMidiEvent[] | null = null;

  constructor(opts?: MidiEventRecorderOptions) {
    this.capacity = Math.max(1, opts?.capacity ?? DEFAULT_CAPACITY);
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.getPosition = opts?.getPosition ?? null;
    this.recordClockTicks = opts?.recordClockTicks === true;
  }

  /** Begin accepting events. Idempotent. */
  start(): void {
    this.recording = true;
  }

  /** Stop accepting events (buffer retained until clear). */
  stop(): void {
    this.recording = false;
  }

  isRecording(): boolean {
    return this.recording;
  }

  clear(): void {
    this.buf = [];
    this.dropped = 0;
    this.cached = null;
  }

  /** Drop the oldest `n` events (for dual event/byte bounds). Returns how many removed. */
  dropOldest(n: number): number {
    if (n <= 0 || this.buf.length === 0) return 0;
    const remove = Math.min(n, this.buf.length);
    this.buf.splice(0, remove);
    this.dropped += remove;
    this.cached = null;
    return remove;
  }

  size(): number {
    return this.buf.length;
  }

  getCapacity(): number {
    return this.capacity;
  }

  getDropped(): number {
    return this.dropped;
  }

  /**
   * Record a message observed on an input port.
   * Does not send MIDI and does not imply an outbound copy.
   */
  recordIncoming(message: MidiMessage): RecordedMidiEvent | null {
    return this.push(message, { kind: 'incoming', portId: message.portId });
  }

  /**
   * Record a message after it was routed outbound.
   * Call this only on the send path — do not also recordIncoming the same
   * echo, or the ring will double-count.
   */
  recordOutbound(
    message: MidiMessage,
    opts?: { routeId?: string; portId?: PortId },
  ): RecordedMidiEvent | null {
    return this.push(message, {
      kind: 'outbound',
      portId: opts?.portId ?? message.portId,
      routeId: opts?.routeId,
    });
  }

  /** Oldest → newest. Same array until next mutation. */
  getEvents(): readonly RecordedMidiEvent[] {
    if (!this.cached) this.cached = this.buf.slice();
    return this.cached;
  }

  getSnapshot(): MidiEventRecorderSnapshot {
    return {
      honesty: 'experimental',
      recording: this.recording,
      capacity: this.capacity,
      size: this.buf.length,
      dropped: this.dropped,
      events: this.getEvents(),
    };
  }

  private push(message: MidiMessage, source: MidiEventSource): RecordedMidiEvent | null {
    if (!this.recording) return null;
    if (!shouldRecord(message.kind, this.recordClockTicks)) return null;

    this.seq += 1;
    const atMs =
      typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
        ? message.timestamp
        : this.now();

    let position: MidiRecorderPosition | null = null;
    if (this.getPosition) {
      try {
        position = this.getPosition();
      } catch {
        position = null;
      }
    }

    const ev: RecordedMidiEvent = {
      seq: this.seq,
      atMs,
      source: { ...source },
      kind: message.kind,
      channel: message.channel,
      note: message.note,
      velocity: message.velocity,
      controller: message.controller,
      value: message.value,
      data: cloneMidiData(message.data),
      position,
      transportMeta: transportMetaFor(message.kind),
    };

    this.buf.push(ev);
    if (this.buf.length > this.capacity) {
      const overflow = this.buf.length - this.capacity;
      this.buf.splice(0, overflow);
      this.dropped += overflow;
    }
    this.cached = null;
    return ev;
  }
}
