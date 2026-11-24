import { CAPTURE_CLOCKS_PER_BAR as TICKS_PER_BAR } from '@dawlessdaw/midi';
import { songEvents, type ClipLength, type Song, type SongEvent } from './song';

export class SongPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar: number | null = null;
  private playheadFraction: (() => number) | null = null;
  private nextBoundary: (() => number) | null = null;
  private pending: { at: number; events: SongEvent[]; ticks: number; activated: () => void } | null = null;

  constructor(
    private readonly send: (event: SongEvent, dueAtMs: number) => void,
    private readonly release: () => void,
    private readonly changed: (message?: string) => void,
    private readonly now = () => performance.now(),
  ) {}

  get playingBar(): number | null {
    return this.bar;
  }

  get barFraction(): number { return this.playheadFraction?.() ?? 0; }

  queueLoop(song: Song, length: ClipLength, activated: () => void): boolean {
    if (!this.nextBoundary) return false;
    const events = songEvents(song.clips, 0);
    if (!events.length) return false;
    this.pending = { at: this.nextBoundary(), events, ticks: length * TICKS_PER_BAR, activated };
    return true;
  }

  cancelQueuedLoop(): void { this.pending = null; }

  secondsUntilSwitch(): number | null {
    return this.pending ? Math.max(0, (this.pending.at - this.now()) / 1000) : null;
  }

  play(song: Song, fromBar: number, loopLength?: ClipLength): boolean {
    let events = songEvents(song.clips, fromBar);
    if (!events.length) return false;
    this.stop();
    const endBar = Math.max(...song.clips.map((clip) => clip.bar + clip.length));
    let endTick = (loopLength ?? endBar - fromBar) * TICKS_PER_BAR;
    const msPerTick = 240_000 / (song.bpm * TICKS_PER_BAR);
    let startedAt = this.now();
    if (loopLength && fromBar === 0) {
      const barMs = TICKS_PER_BAR * msPerTick;
      this.nextBoundary = () => startedAt + (Math.floor((this.now() - startedAt) / barMs) + 1) * barMs;
    }
    this.playheadFraction = () => {
      const barOffset = (this.bar ?? fromBar) - fromBar;
      return Math.max(0, Math.min(1, (this.now() - startedAt) / (TICKS_PER_BAR * msPerTick) - barOffset));
    };
    let lastUpdate = startedAt;
    let i = 0;
    const flush = () => {
      const now = this.now();
      if (now - lastUpdate > 100) {
        this.stop('Song stopped after a playback delay');
        return;
      }
      lastUpdate = now;
      let tick = (now - startedAt) / msPerTick;
      const dispatch = (through: number) => {
        while (i < events.length && events[i]!.tick <= through) {
          const event = events[i++]!;
          this.send(event, startedAt + event.tick * msPerTick);
        }
      };
      const pending = this.pending;
      const loopEnd = startedAt + endTick * msPerTick;
      if (pending && now >= pending.at && pending.at <= loopEnd + 0.001) {
        const cut = (pending.at - startedAt) / msPerTick;
        // The incoming Part owns the boundary. Release the outgoing Part first.
        while (i < events.length && events[i]!.tick < cut - 0.00001) {
          const event = events[i++]!;
          this.send(event, startedAt + event.tick * msPerTick);
        }
        this.release();
        this.pending = null;
        events = pending.events;
        endTick = pending.ticks;
        startedAt = pending.at;
        tick = (now - startedAt) / msPerTick;
        i = 0;
        dispatch(tick);
        pending.activated();
      } else {
        dispatch(Math.min(tick, endTick));
      }
      if (tick >= endTick) {
        if (!loopLength) {
          this.stop('Song finished');
          return;
        }
        this.release();
        startedAt += endTick * msPerTick;
        tick = (now - startedAt) / msPerTick;
        i = 0;
        dispatch(tick);
      }
      const bar = fromBar + Math.floor(tick / TICKS_PER_BAR);
      if (bar !== this.bar) {
        this.bar = bar;
        this.changed();
      }
    };
    this.timer = setInterval(flush, 4);
    flush();
    return true;
  }

  stop(message?: string): void {
    if (this.timer == null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.nextBoundary = null;
    this.playheadFraction = null;
    this.pending = null;
    this.bar = null;
    this.release();
    this.changed(message);
  }
}
