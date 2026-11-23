/**
 * MIDI→audio Latency Lab runner (Timing Lab Stage B).
 * User-triggered only. Never applies delay correction. Never monitors to speakers.
 */

import {
  findOnset,
  summarizeLatency,
  type LatencySample,
  type LatencyStats,
  type OnsetConfidence,
} from './onset';

export type LatencyDestId = 'mpc' | 'sp' | 'fm1';

export interface LatencyLabProgress {
  phase: 'idle' | 'arming' | 'running' | 'done' | 'error';
  index: number;
  total: number;
  message: string;
}

export interface LatencyLabResult {
  destination: LatencyDestId;
  audioInputId: string;
  audioInputLabel: string;
  samples: LatencySample[];
  stats: LatencyStats;
  honesty: 'experimental';
}

export interface RunLatencyLabOpts {
  destination: LatencyDestId;
  /** Web MIDI output port id */
  midiOutPortId: string;
  midiChannel: number;
  note: number;
  audioInputId: string;
  audioInputLabel: string;
  /** How many pings */
  count?: number;
  /** Gap between note-ons (ms) */
  gapMs?: number;
  /** Capture window after each send (ms) */
  captureMs?: number;
  /** Send raw MIDI bytes to the port */
  sendMidi: (portId: string, data: Uint8Array) => void;
  onProgress?: (p: LatencyLabProgress) => void;
  /** Abort signal */
  signal?: AbortSignal;
}

function noteOn(ch: number, note: number, vel: number): Uint8Array {
  return new Uint8Array([0x90 | ((ch - 1) & 0x0f), note & 0x7f, vel & 0x7f]);
}

function noteOff(ch: number, note: number): Uint8Array {
  return new Uint8Array([0x80 | ((ch - 1) & 0x0f), note & 0x7f, 0]);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Run a short series of MIDI note pings and measure audio onsets on the chosen input.
 * Input is never connected to AudioContext.destination (no feedback loop).
 */
export async function runLatencyLab(opts: RunLatencyLabOpts): Promise<LatencyLabResult> {
  const count = opts.count ?? 6;
  const gapMs = opts.gapMs ?? 450;
  const captureMs = opts.captureMs ?? 350;
  const progress = (p: LatencyLabProgress) => opts.onProgress?.(p);

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Latency Lab needs a browser with getUserMedia (Chrome).');
  }

  progress({ phase: 'arming', index: 0, total: count, message: 'Opening audio input (no monitor)…' });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: opts.audioInputId ? { exact: opts.audioInputId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const source = ctx.createMediaStreamSource(stream);
  // Intentionally NOT connecting to ctx.destination — avoid feedback.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const samples: LatencySample[] = [];
  const sampleRate = ctx.sampleRate;
  const captureSamples = Math.round((captureMs / 1000) * sampleRate);
  const timeDomain = new Float32Array(analyser.fftSize);

  try {
    if (ctx.state === 'suspended') await ctx.resume();
    // Warm-up read
    await sleep(80, opts.signal);

    for (let i = 0; i < count; i++) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      progress({
        phase: 'running',
        index: i + 1,
        total: count,
        message: `Ping ${i + 1}/${count} → ${opts.destination.toUpperCase()}…`,
      });

      const sentAt = performance.now();
      opts.sendMidi(opts.midiOutPortId, noteOn(opts.midiChannel, opts.note, 100));

      // Capture a short mono buffer by polling analyser (approx).
      const buf = new Float32Array(captureSamples);
      let written = 0;
      const start = performance.now();
      while (written < captureSamples && performance.now() - start < captureMs + 50) {
        analyser.getFloatTimeDomainData(timeDomain);
        const take = Math.min(timeDomain.length, captureSamples - written);
        buf.set(timeDomain.subarray(0, take), written);
        written += take;
        await sleep(4, opts.signal);
      }

      opts.sendMidi(opts.midiOutPortId, noteOff(opts.midiChannel, opts.note));

      const hit = findOnset(buf.subarray(0, written), sampleRate, {
        searchFrom: Math.round(sampleRate * 0.002),
      });
      let onsetAt: number | null = null;
      let latencyMs: number | null = null;
      let confidence: OnsetConfidence = 'Unknown';
      if (hit) {
        onsetAt = sentAt + hit.timeMs;
        latencyMs = Math.round(hit.timeMs * 10) / 10;
        confidence = hit.confidence;
      }
      samples.push({
        sentAt,
        onsetAt,
        latencyMs,
        confidence,
        note: opts.note,
        channel: opts.midiChannel,
      });

      await sleep(gapMs, opts.signal);
    }
  } finally {
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    for (const t of stream.getTracks()) t.stop();
    await ctx.close().catch(() => undefined);
  }

  const stats = summarizeLatency(samples);
  progress({ phase: 'done', index: count, total: count, message: 'Done — review min / median / max.' });

  return {
    destination: opts.destination,
    audioInputId: opts.audioInputId,
    audioInputLabel: opts.audioInputLabel,
    samples,
    stats,
    honesty: 'experimental',
  };
}
