import type { WorkspaceId } from '../studio/runtime';
import { clearUiChip, useUiSelection } from '../nav/uiSelection';

/**
 * Sticky selection carry chip (Pass C). Cheap context across Rig ↔ Live ↔ Setup.
 */
export function ContextChip({ workspace }: { workspace: WorkspaceId }) {
  const { chip } = useUiSelection();
  if (!chip) return null;
  // A carried selection is meaningful only in the workspace that receives it.
  if (workspace !== (chip === 'Setup' || chip.startsWith('Ports · ') ? 'setup' : 'controller')) return null;
  return (
    <div className="context-chip" role="status" title="Selection from Rig / devices">
      <span className="context-chip-label">{chip}</span>
      <button type="button" className="context-chip-x ghost" aria-label="Clear context" onClick={() => clearUiChip()}>
        ×
      </button>
    </div>
  );
}
