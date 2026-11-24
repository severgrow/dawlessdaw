export const CIRCUIT_TRACKS_INPUTS = [
  { channel: 1, label: 'Synth 1' },
  { channel: 2, label: 'Synth 2' },
  { channel: 3, label: 'MIDI 1' },
  { channel: 4, label: 'MIDI 2' },
  { channel: 10, label: 'Drums 1–4 · Shared' },
] as const;

export function circuitTracksNote(data: readonly number[]) {
  const [status, pitch, velocity] = data;
  if (status == null || (status & 0xf0) !== 0x90 || pitch == null || !velocity) return null;
  const channel = (status & 0xf) + 1;
  const label = CIRCUIT_TRACKS_INPUTS.find((input) => input.channel === channel)?.label ?? 'Outside factory mapping';
  return { channel, label, pitch, velocity };
}
