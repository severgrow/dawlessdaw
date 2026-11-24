import { CAPTURE_CLOCKS_PER_BAR as TICKS_PER_BAR } from '@dawlessdaw/midi';
import { songEvents, type ClipLength, type Song, type SongEvent } from './song';

export class SongPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar: number | null = null;

  constructor(
    private readonly send: (event: SongEvent, dueAtMs: number) => void,
    private readonly release: () => void,
    private readonly changed: (message?: string) => void,
    private readonly now = () => performance.now(),
  ) {}

  get playingBar(): number | null {
    return this.bar;
  }

  play(song: Song, fromBar: number, loopLength?: ClipLength): boolean {
    const events = songEvents(song.clips, fromBar);
    if (!events.length) return false;
    this.stop();
    const endBar = Math.max(...song.clips.map((clip) => clip.bar + clip.length));
    const endTick = (loopLength ?? endBar - fromBar) * TICKS_PER_BAR;
    const msPerTick = 240_000 / (song.bpm * TICKS_PER_BAR);
    let startedAt = this.now();
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
      dispatch(Math.min(tick, endTick));
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
    this.bar = null;
    this.release();
    this.changed(message);
  }
}
