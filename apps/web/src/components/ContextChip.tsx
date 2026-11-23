import { clearUiChip, useUiSelection } from '../nav/uiSelection';

/**
 * Sticky selection carry chip (Pass C). Cheap context across Rig ↔ Live ↔ Setup.
 */
export function ContextChip() {
  const { chip } = useUiSelection();
  if (!chip) return null;
  return (
    <div className="context-chip" role="status" title="Selection from Rig / devices">
      <span className="context-chip-label">{chip}</span>
      <button type="button" className="context-chip-x ghost" aria-label="Clear context" onClick={() => clearUiChip()}>
        ×
      </button>
    </div>
  );
}
