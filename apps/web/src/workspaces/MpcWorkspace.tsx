import { MpcLibraryBrowser } from '../mpc-library/MpcLibraryBrowser';

/** Sounds → MPC — Phase D project browser (read-only). */
export function MpcWorkspace() {
  return (
    <div className="workspace mpc-workspace">
      <MpcLibraryBrowser />
    </div>
  );
}
