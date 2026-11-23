/**
 * Phase E — Import library WAV / fixture sample into FLIP.
 * Reuses Session take store + FlipEngine.importExternalAudio.
 * No auto gain / normalize.
 */
import { fixtureSamplePcm, type MpcLibraryEntry } from '@dawlessdaw/mpc-library';
import { getFlipEngine } from '../flip/flipEngine';
import type { FlipClipMeta } from '../flip/types';
import type { StereoAudio } from '../recorder/types';

export interface ImportToFlipResult {
  ok: boolean;
  clip: FlipClipMeta | null;
  message: string;
}

export async function importLibraryEntryToFlip(
  entry: MpcLibraryEntry,
): Promise<ImportToFlipResult> {
  if (entry.kind !== 'sample') {
    return {
      ok: false,
      clip: null,
      message: 'Import to FLIP needs a WAV / sample — pick an Audio item',
    };
  }

  const pcm = fixtureSamplePcm(entry);
  const audio: StereoAudio = {
    sampleRate: pcm.sampleRate,
    left: pcm.left,
    right: pcm.right,
  };

  const clip = await getFlipEngine().importExternalAudio({
    name: entry.name.replace(/\.[^.]+$/, '') || entry.name,
    audio,
    sourceLabel: `MPC Library · ${entry.relativePath}`,
  });

  if (!clip) {
    return { ok: false, clip: null, message: 'FLIP import failed' };
  }

  return {
    ok: true,
    clip,
    message: `Imported “${entry.name}” → FLIP (gain 1 · no normalize)`,
  };
}
