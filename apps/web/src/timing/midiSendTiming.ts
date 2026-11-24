import type { MidiMessage } from '@dawlessdaw/core';
import type { MidiRouteTiming } from '@dawlessdaw/events';

const SAMPLE_LIMIT = 64;
const TRACE_LIMIT = 256;

export interface MidiTimingStats {
  samples: number;
  meanMs: number;
  jitterMs: number;
  maxMs: number;
}

export class MidiSendTiming {
  private live: number[] = [];
  private song: number[] = [];
  private trace: {
    mode: MidiRouteTiming['mode'];
    referenceAtMs: number;
    sentAtMs: number;
    delayMs: number;
    routeId: string;
    input: { port: string; channel?: number; note?: number };
    output: { port: string; channel?: number; note?: number };
    kind: MidiMessage['kind'];
  }[] = [];

  record(timing: MidiRouteTiming, output: MidiMessage, routeId: string, includeInStats: boolean): void {
    const referenceAtMs = timing.mode === 'song' ? timing.dueAtMs : timing.source.timestamp;
    const delayMs = timing.sentAtMs - referenceAtMs;
    if (!Number.isFinite(delayMs) || delayMs < 0) return;
    const describe = ({ portId, channel, note }: MidiMessage) => ({ port: portId, channel, note });
    this.trace.push({
      mode: timing.mode,
      referenceAtMs,
      sentAtMs: timing.sentAtMs,
      delayMs,
      routeId,
      input: describe(timing.source),
      output: describe(output),
      kind: output.kind,
    });
    if (this.trace.length > TRACE_LIMIT) this.trace.shift();
    if (!includeInStats || output.kind !== 'note-on') return;
    const samples = timing.mode === 'live' ? this.live : this.song;
    samples.push(delayMs);
    if (samples.length > SAMPLE_LIMIT) samples.shift();
  }

  stats(mode: MidiRouteTiming['mode']): MidiTimingStats | null {
    const samples = mode === 'live' ? this.live : this.song;
    if (!samples.length) return null;
    const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
    const variance = samples.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / samples.length;
    const round = (ms: number) => Math.round(ms * 100) / 100;
    return { samples: samples.length, meanMs: round(mean), jitterMs: round(Math.sqrt(variance)), maxMs: round(Math.max(...samples)) };
  }

  exportTrace() {
    return [...this.trace];
  }

  reset(): void {
    this.live = [];
    this.song = [];
    this.trace = [];
  }
}
