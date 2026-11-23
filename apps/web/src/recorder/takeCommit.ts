/**
 * Save / recovery commit policy (audio fidelity P1).
 *
 * Never clear draft chunks until the complete take is verified saved.
 * Cross/Audacity-style: recovery survives a failed write.
 */

export type TakeCommitPhase =
  | 'saved_and_cleared'
  | 'save_failed'
  | 'verify_failed';

export interface TakeCommitHooks {
  /** Persist the complete take. Must return true only on success. */
  save: () => Promise<boolean>;
  /** Optional read-back check (meta + pcm present). */
  verify?: () => Promise<boolean>;
  /** Clear draft + chunk recovery — only called after save (+ verify) succeed. */
  clearRecovery: () => Promise<void>;
}

/**
 * Pure decision: may we delete recovery after this save/verify outcome?
 */
export function mayClearRecovery(saveOk: boolean, verifyOk: boolean | undefined): boolean {
  if (!saveOk) return false;
  if (verifyOk === false) return false;
  return true;
}

/**
 * Save → optional verify → clear recovery only when both succeed.
 * Failure injection: stub `save` / `verify` to return false — recovery must remain.
 */
export async function commitTakeKeepingRecovery(
  hooks: TakeCommitHooks,
): Promise<TakeCommitPhase> {
  let saveOk = false;
  try {
    saveOk = (await hooks.save()) === true;
  } catch {
    saveOk = false;
  }
  if (!saveOk) return 'save_failed';

  let verifyOk: boolean | undefined;
  if (hooks.verify) {
    try {
      verifyOk = (await hooks.verify()) === true;
    } catch {
      verifyOk = false;
    }
    if (!mayClearRecovery(true, verifyOk)) return 'verify_failed';
  }

  if (!mayClearRecovery(true, verifyOk)) return 'save_failed';

  await hooks.clearRecovery();
  return 'saved_and_cleared';
}
