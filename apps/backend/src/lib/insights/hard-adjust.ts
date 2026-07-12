/**
 * The decision behind a Hard adjust, as a pure function so the rule can be tested on its own
 * (same reason ledger-math.ts is pure).
 *
 * The delta is measured against BATCH-BACKED stock, never the shelf number. That is what makes
 * a hard adjust a reconciler: whatever the shelf currently claims, afterwards the books and the
 * shelf both land on `target`.
 *
 * Increasing REQUIRES a cost per unit. Those units become a new cost layer, and a layer worth
 * zero would understate COGS on every future sale that draws from it — the exact failure batch
 * costing exists to prevent. Decreasing needs no cost: the write-off is valued at FIFO.
 */

export type HardAdjustPlan = {
  target: number
  /** target − batch-backed. > 0 adds a costed layer, < 0 writes stock off, 0 only fixes drift. */
  delta: number
  /** Set when the plan is invalid; the caller turns this into a MedusaError. */
  error?: string
}

export function planHardAdjust(
  targetQty: number,
  fifoRemaining: number,
  unitCost?: number
): HardAdjustPlan {
  const target = Math.max(0, Math.trunc(Number(targetQty) || 0))
  const delta = target - fifoRemaining

  if (delta > 0 && !(Number(unitCost) > 0)) {
    return {
      target,
      delta,
      error:
        `Adding ${delta} unit(s) needs a cost per unit — they become a new cost layer, and a ` +
        `layer worth zero would understate COGS on every sale that draws from it.`,
    }
  }

  return { target, delta }
}
