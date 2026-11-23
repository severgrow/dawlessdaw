import { MpcLibraryBrowser } from './MpcLibraryBrowser';

/**
 * Setup → Experimental embed of the Phase D browser (compact).
 * Same honesty rules: never fake Connected.
 */
export function MpcLibraryPanel() {
  return <MpcLibraryBrowser compact />;
}
