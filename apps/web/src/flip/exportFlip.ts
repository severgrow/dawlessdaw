/**
 * FLIP WAV export — reuses Session Recorder encodeWav (16/24).
 * Pack / guided slices / SP-compatible download — never SP serial write.
 */
import { downloadBlob } from '../recorder/exportTake';
import { encodeWav } from '../recorder/wav';
import type { StereoAudio } from '../recorder/types';
import { sliceStereo } from '../recorder/pcmMath';
import { encodeSpReadyWav } from '../sp404/spVolumeHandle';
import { cleanSampleName, padKey, type SpBank } from '../sp404/samplePrep';
import { savePad, type StoredPad } from '../sp404/padStore';
import type { FlipClipMeta, FlipExportOpts } from './types';
import type { FlipGuidedSlice } from './midiGuide';
import { chopEqual, renderFlipAudio, softEdge } from './process';

export function defaultFlipFilename(clip: FlipClipMeta, bitDepth: 16 | 24): string {
  const safe = clip.name.replace(/[^\w\-]+/g, '_').slice(0, 40);
  return `${safe}_${clip.bars}bar_${bitDepth}bit.wav`;
}

export async function exportFlipWav(
  source: StereoAudio,
  clip: FlipClipMeta,
  opts: Partial<FlipExportOpts> = {},
): Promise<{ filename: string; blob: Blob }> {
  const bitDepth = opts.wavBitDepth ?? 24;
  const filename = opts.filename ?? defaultFlipFilename(clip, bitDepth);
  let audio = renderFlipAudio(source, clip);
  if (clip.fadeInMs === 0 && clip.fadeOutMs === 0) {
    audio = softEdge(audio, 8);
  }
  const buffer = encodeWav(audio, bitDepth, {
    title: clip.name,
    bpm: String(Math.round(clip.bpm)),
    date: new Date(clip.createdAt).toISOString().slice(0, 10),
  });
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return { filename, blob };
}

export function downloadFlipWav(
  source: StereoAudio,
  clip: FlipClipMeta,
  opts?: Partial<FlipExportOpts>,
): Promise<string> {
  return exportFlipWav(source, clip, opts).then(({ filename, blob }) => {
    downloadBlob(blob, filename);
    return filename;
  });
}

export async function exportChopWavs(
  source: StereoAudio,
  clip: FlipClipMeta,
  bitDepth: 16 | 24 = 24,
): Promise<string[]> {
  if (!clip.chop) return [];
  const rendered = renderFlipAudio(source, clip);
  const parts = chopEqual(rendered, clip.chop.slices);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const filename = `${clip.name.replace(/[^\w\-]+/g, '_').slice(0, 32)}_slice${i + 1}.wav`;
    const buffer = encodeWav(part, bitDepth, {
      title: `${clip.name} slice ${i + 1}`,
      bpm: String(Math.round(clip.bpm)),
    });
    downloadBlob(new Blob([buffer], { type: 'audio/wav' }), filename);
    names.push(filename);
  }
  return names;
}

function guidedParts(
  source: StereoAudio,
  clip: FlipClipMeta,
  slices: FlipGuidedSlice[],
): { slice: FlipGuidedSlice; audio: StereoAudio }[] {
  const rendered = renderFlipAudio(source, clip);
  // Guided frames are in take space; map into rendered (trim-relative) coords.
  const trim0 = clip.trim.startFrame;
  return slices.map((s) => {
    const a = Math.max(0, s.startFrame - trim0);
    const b = Math.max(a + 1, s.endFrame - trim0);
    return {
      slice: s,
      audio: sliceStereo(rendered, a, Math.min(rendered.left.length, b)),
    };
  });
}

/** Export MIDI-guided / refined slices as individual WAVs (download). */
export async function exportGuidedSliceWavs(
  source: StereoAudio,
  clip: FlipClipMeta,
  bitDepth: 16 | 24 = 24,
): Promise<string[]> {
  const slices = clip.midiGuide?.slices ?? [];
  if (!slices.length) return [];
  const parts = guidedParts(source, clip, slices);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const { slice, audio } = parts[i]!;
    if (audio.left.length < 1) continue;
    const filename = `${clip.name.replace(/[^\w\-]+/g, '_').slice(0, 28)}_g${i + 1}.wav`;
    const buffer = encodeWav(audio, bitDepth, {
      title: slice.label,
      bpm: String(Math.round(clip.bpm)),
    });
    downloadBlob(new Blob([buffer], { type: 'audio/wav' }), filename);
    names.push(filename);
  }
  return names;
}

/**
 * Pack: loop WAV + guided/chop slices + JSON manifest (downloads).
 * No zip dependency — sequential downloads + manifest.json.
 */
export async function exportFlipPack(
  source: StereoAudio,
  clip: FlipClipMeta,
  bitDepth: 16 | 24 = 24,
): Promise<string[]> {
  const names: string[] = [];
  const loop = await exportFlipWav(source, clip, { wavBitDepth: bitDepth });
  downloadBlob(loop.blob, loop.filename);
  names.push(loop.filename);

  if (clip.midiGuide?.slices.length) {
    names.push(...(await exportGuidedSliceWavs(source, clip, bitDepth)));
  } else if (clip.chop) {
    names.push(...(await exportChopWavs(source, clip, bitDepth)));
  }

  const manifest = {
    honesty: 'experimental' as const,
    clipId: clip.id,
    takeId: clip.takeId,
    name: clip.name,
    bars: clip.bars,
    bpm: clip.bpm,
    midiGuide: clip.midiGuide
      ? {
          mode: clip.midiGuide.mode,
          latencyMs: clip.midiGuide.latencyMs,
          latencySource: clip.midiGuide.latencySource,
          latencyCalibrated: clip.midiGuide.latencyCalibrated,
          latencyNote: clip.midiGuide.latencyNote,
          eventCount: clip.midiGuide.events.length,
          slices: clip.midiGuide.slices.map((s) => ({
            label: s.label,
            startFrame: s.startFrame,
            endFrame: s.endFrame,
            source: s.source,
          })),
        }
      : null,
    note: 'Original take PCM unchanged. Labels are Controller-routing context — not stems. No SP serial write.',
  };
  const manName = `${clip.name.replace(/[^\w\-]+/g, '_').slice(0, 32)}_pack.json`;
  downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), manName);
  names.push(manName);
  return names;
}

/** SP-compatible 48 kHz / 16-bit WAV download for a guided slice (or whole loop). */
export async function exportFlipSpWav(
  source: StereoAudio,
  clip: FlipClipMeta,
  sliceIndex: number | null = null,
): Promise<string> {
  let audio = renderFlipAudio(source, clip);
  if (sliceIndex != null && clip.midiGuide?.slices[sliceIndex]) {
    const parts = guidedParts(source, clip, [clip.midiGuide.slices[sliceIndex]!]);
    audio = parts[0]?.audio ?? audio;
  }
  const buffer = await encodeSpReadyWav(audio);
  const filename = `${clip.name.replace(/[^\w\-]+/g, '_').slice(0, 28)}_sp48k16.wav`;
  downloadBlob(new Blob([buffer], { type: 'audio/wav' }), filename);
  return filename;
}

/** Push guided slices into Samples pad store (browser IndexedDB) — no SP write. */
export async function sendGuidedSlicesToSamples(
  source: StereoAudio,
  clip: FlipClipMeta,
  opts?: { bank?: SpBank; startPad?: number },
): Promise<{ saved: number; keys: string[] }> {
  const slices = clip.midiGuide?.slices ?? [];
  if (!slices.length) return { saved: 0, keys: [] };
  const bank = opts?.bank ?? 'A';
  let pad = Math.max(1, Math.min(16, opts?.startPad ?? 1));
  const parts = guidedParts(source, clip, slices);
  const keys: string[] = [];
  for (const { slice, audio } of parts) {
    if (audio.left.length < 1) continue;
    if (pad > 16) break;
    const key = padKey(bank, pad);
    const stored: StoredPad = {
      key,
      bank,
      pad,
      sourceName: cleanSampleName(slice.label || `${clip.name} ${pad}`),
      audio: {
        sampleRate: audio.sampleRate,
        channels: [Float32Array.from(audio.left), Float32Array.from(audio.right)],
      },
      edit: {
        name: cleanSampleName(slice.label || `flip ${pad}`),
        trimStart: 0,
        trimEnd: null,
        normalize: false,
      },
    };
    const ok = await savePad(stored);
    if (ok) keys.push(key);
    pad += 1;
  }
  return { saved: keys.length, keys };
}
