import type { MidiMessage } from '@dawlessdaw/core';
import type { MidiRouteTiming } from '@dawlessdaw/events';

const SAMPLE_LIMIT = 64;
const TRACE_LIMIT = 256;
const PERCENTILE_LIMIT = 1024;

export interface MidiTimingStats {
  samples: number;
  meanMs: number;
  jitterMs: number;
  maxMs: number;
}

const describe = ({ portId, channel, note, velocity }: MidiMessage) => ({ port: portId, channel, note, velocity });

type SendSample = {
  mode: MidiRouteTiming['mode'];
  referenceAtMs: number;
  sentAtMs: number;
  delayMs: number;
  routeId: string;
  input: ReturnType<typeof describe>;
  output: ReturnType<typeof describe>;
  kind: MidiMessage['kind'];
};

export class MidiSendTiming {
  private live: number[] = [];
  private song: number[] = [];
  private trace: SendSample[] = [];
  private inputs: (ReturnType<typeof describe> & { atMs: number; kind: MidiMessage['kind'] })[] = [];
  private received = 0;
  private recentDelays = { live: [] as number[], song: [] as number[] };
  private failed = { live: 0, song: 0 };
  private sends = { live: 0, song: 0 };
  private worst: Record<MidiRouteTiming['mode'], SendSample | null> = { live: null, song: null };

  recordInput(message: MidiMessage): void {
    this.inputs.push({ ...describe(message), atMs: message.timestamp, kind: message.kind });
    if (this.inputs.length > TRACE_LIMIT) this.inputs.shift();
    if (message.kind === 'note-on') this.received++;
  }

  recordFailed(timing: MidiRouteTiming): void {
    this.failed[timing.mode]++;
  }

  routeSignal(channel: number, port: string) {
    const input = this.inputs.slice().reverse().find((event) => event.channel === channel && event.port === port && event.kind === 'note-on');
    const outputs = input ? this.trace.filter((event) => event.mode === 'live' && event.kind === 'note-on' &&
      event.referenceAtMs === input.atMs && event.input.port === input.port &&
      event.input.channel === channel && event.input.note === input.note).map((event) => event.output) : [];
    return { input, outputs };
  }

  percentile(mode: MidiRouteTiming['mode']): number | null {
    const values = this.recentDelays[mode].slice().sort((a, b) => a - b);
    return values.length ? Math.round(values[Math.ceil(values.length * .95) - 1]! * 100) / 100 : null;
  }

  summary() {
    const maxMs = (sample: SendSample | null) => sample && Math.round(sample.delayMs * 100) / 100;
    return {
      received: this.received,
      live: { sends: this.sends.live, maxMs: maxMs(this.worst.live) },
      song: { sends: this.sends.song, maxMs: maxMs(this.worst.song) },
    };
  }

  health() {
    return { p95Ms: { live: this.percentile('live'), song: this.percentile('song') }, failedNoteSends: { ...this.failed } };
  }

  exportSession() {
    return { ...this.summary(), ...this.health(), recentInputs: [...this.inputs], worstSends: { ...this.worst } };
  }

  record(timing: MidiRouteTiming, output: MidiMessage, routeId: string, includeInStats: boolean): void {
    const referenceAtMs = timing.mode === 'song' ? timing.dueAtMs : timing.source.timestamp;
    const delayMs = timing.sentAtMs - referenceAtMs;
    if (!Number.isFinite(delayMs) || delayMs < 0) return;
    const sample = {
      mode: timing.mode,
      referenceAtMs,
      sentAtMs: timing.sentAtMs,
      delayMs,
      routeId,
      input: describe(timing.source),
      output: describe(output),
      kind: output.kind,
    };
    this.trace.push(sample);
    if (this.trace.length > TRACE_LIMIT) this.trace.shift();
    if (output.kind !== 'note-on') return;
    this.sends[timing.mode]++;
    const recent = this.recentDelays[timing.mode];
    recent.push(delayMs);
    if (recent.length > PERCENTILE_LIMIT) recent.shift();
    const worst = this.worst[timing.mode];
    if (!worst || delayMs > worst.delayMs) this.worst[timing.mode] = sample;
    if (!includeInStats) return;
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
    this.inputs = [];
    this.received = 0;
    this.sends = { live: 0, song: 0 };
    this.failed = { live: 0, song: 0 };
    this.recentDelays = { live: [], song: [] };
    this.worst = { live: null, song: null };
  }
}
