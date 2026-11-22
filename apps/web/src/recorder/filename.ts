/** Editable filename pattern helpers for Session Recorder exports. */

export interface FilenameContext {
  date: Date;
  name: string;
  bpm: number | null;
  ext: 'wav' | 'mp3';
  part?: string;
}

/** Default pattern: `2026-11-22 Ploe jam 128bpm.wav` */
export const DEFAULT_FILENAME_PATTERN = '{date} {name}{bpm}';

export function sanitizeFilenamePart(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function formatDateStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pattern tokens: {date} {name} {bpm} {part}
 * `{bpm}` expands to ` 128bpm` or empty when unknown.
 */
export function renderFilename(pattern: string, ctx: FilenameContext): string {
  const bpm =
    ctx.bpm != null && Number.isFinite(ctx.bpm) ? ` ${Math.round(ctx.bpm)}bpm` : '';
  const base = pattern
    .replaceAll('{date}', formatDateStamp(ctx.date))
    .replaceAll('{name}', sanitizeFilenamePart(ctx.name) || 'take')
    .replaceAll('{bpm}', bpm)
    .replaceAll('{part}', ctx.part ? ` ${sanitizeFilenamePart(ctx.part)}` : '');
  const cleaned = sanitizeFilenamePart(base) || 'take';
  const withExt = cleaned.toLowerCase().endsWith(`.${ctx.ext}`)
    ? cleaned
    : `${cleaned}.${ctx.ext}`;
  return withExt;
}
