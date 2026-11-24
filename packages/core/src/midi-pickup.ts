/** A MIDI CC has reached its remembered value or moved across it. */
export function reachedMidiPickup(previous: number | null, value: number, target: number): boolean {
  return Math.abs(value - target) <= 1 ||
    (previous !== null && (previous - target) * (value - target) < 0);
}
