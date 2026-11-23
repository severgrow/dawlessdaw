import { MpcLibraryBrowser } from '../mpc-library/MpcLibraryBrowser';

/**
 * Sounds → MPC — read-only library browser.
 * Premium design showcase: follow `.mpc-lib-*` + `:root` tokens for future UI.
 */
export function MpcWorkspace() {
  return (
    <div className="workspace mpc-workspace">
      <MpcLibraryBrowser />
    </div>
  );
}
