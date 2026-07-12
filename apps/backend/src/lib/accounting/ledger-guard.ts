import type { LedgerSourceType } from "../../modules/accounting/categories"

/**
 * MAY this cash row be edited or deleted from the Cash Book?
 *
 * One pure rule, used by BOTH the list endpoint (to flag rows for the UI) and the workflow
 * steps (to actually enforce it) — so the buttons the user sees and what the server allows can
 * never disagree.
 *
 * The principle: a row may only be touched here if nothing else depends on it.
 *
 *   manual         → yours to edit and delete.
 *   fixed_asset    → mirrors a register row. Editing it here would drift the cash away from
 *   marketing_spend  the thing it paid for, so it's managed from its own tab.
 *   restock        → normally paired with a stock BATCH: the cash and the goods are two halves
 *                    of one event, so it's managed from the Restock tab.
 *                    BUT a restock row with no batch behind it is an ORPHAN — a leftover from
 *                    before batches existed. Nothing depends on it, nothing gets stranded, and
 *                    refusing to delete it just leaves a wrong number in the books forever.
 *                    So: orphans are editable and deletable.
 */

export type LedgerGuard = {
  can_edit: boolean
  can_delete: boolean
  /** Why not, and where to do it instead. Null when the row is freely editable. */
  reason: string | null
}

export function ledgerRowGuard(
  sourceType: LedgerSourceType | string,
  hasBackingBatch: boolean
): LedgerGuard {
  if (sourceType === "manual") {
    return { can_edit: true, can_delete: true, reason: null }
  }

  if (sourceType === "restock") {
    if (hasBackingBatch) {
      return {
        can_edit: false,
        can_delete: false,
        reason:
          "This restock's cash is tied to a stock batch. Edit or delete the batch from the " +
          "Restock tab and this row follows — otherwise the stock and the cash that paid for " +
          "it would drift apart.",
      }
    }
    // Orphan: cash with no batch behind it (pre-batch leftover). Safe to fix or remove.
    return { can_edit: true, can_delete: true, reason: null }
  }

  if (sourceType === "fixed_asset") {
    return {
      can_edit: false,
      can_delete: false,
      reason:
        "This row mirrors a fixed asset. Edit or delete it from the Fixed Assets tab and this " +
        "row follows.",
    }
  }

  if (sourceType === "marketing_spend") {
    return {
      can_edit: false,
      can_delete: false,
      reason:
        "This row mirrors a marketing spend. Edit or delete it from the Marketing tab and this " +
        "row follows.",
    }
  }

  return {
    can_edit: false,
    can_delete: false,
    reason: `This row is owned by "${sourceType}" and can't be changed from the Cash Book.`,
  }
}
