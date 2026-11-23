import type { MpcLibrarySshStatus } from './contract';

/**
 * SSH library access is a future opt-in only.
 * Phase C never opens sockets, never runs ssh, never enables developer mode.
 */
export function resolveSshLibraryStatus(opts: { optIn?: boolean } = {}): MpcLibrarySshStatus {
  const optIn = opts.optIn === true;
  if (!optIn) {
    return {
      available: false,
      optInRequired: true,
      reason:
        'SSH library access requires explicit opt-in later — Phase C ships fixtures only (no SSH).',
    };
  }
  return {
    available: false,
    optInRequired: true,
    reason:
      'SSH opt-in acknowledged, but Phase C has no SSH implementation — still fixtures / Offline until a later phase.',
  };
}
