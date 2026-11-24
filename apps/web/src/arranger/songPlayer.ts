import { CAPTURE_CLOCKS_PER_BAR as TICKS_PER_BAR } from '@dawlessdaw/midi';
import { songEvents, type Song, type SongEvent } from './song';

export class SongPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar: number | null = null;

  constructor(
    private readonly send: (event: SongEvent) => void,
    private readonly release: () => void,
    private readonly changed: (message?: string) => void,
    private readonly now = () => performance.now(),
  ) {}

  get playingBar(): number | null {
    return this.bar;
  }

  play(song: Song, fromBar: number): boolean {
    const events = songEvents(song.clips, fromBar);
    if (!events.length) return false;
    this.stop();
    const endBar = Math.max(...song.clips.map((clip) => clip.bar + clip.length));
    const endTick = (endBar - fromBar) * TICKS_PER_BAR;
    const msPerTick = 240_000 / (song.bpm * TICKS_PER_BAR);
    const startedAt = this.now();
    let lastUpdate = startedAt;
    let i = 0;
    const flush = () => {
      const now = this.now();
      if (now - lastUpdate > 100) {
        this.stop('Song stopped after a playback delay');
        return;
      }
      lastUpdate = now;
      const tick = (now - startedAt) / msPerTick;
      while (i < events.length && events[i]!.tick <= tick) this.send(events[i++]!);
      if (tick >= endTick) {
        this.stop('Song finished');
        return;
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
