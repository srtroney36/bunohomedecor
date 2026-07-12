/**
 * Shared enums for the batch/FIFO layer. The models, the workflow validators and the admin
 * UI all derive from these, so there is one spelling of every source/reason.
 */

/** How a stock batch (cost layer) came into existence. */
export const STOCK_BATCH_SOURCES = [
  // A restock: goods received AND supplier cash paid, booked together. Carries a ledger_entry_id.
  "restock",
  // Found stock / positive stock-count correction. Adds a cost layer at a cost you enter,
  // but NO cash moved — nobody paid a supplier, the units were already there.
  "found",
  // A migration/opening balance, if ever seeded. Unused on a clean, empty-inventory cutover.
  "opening",
] as const
export type StockBatchSource = (typeof STOCK_BATCH_SOURCES)[number]

/** Why stock left outside of a customer order (a non-sale, non-return reduction). */
export const STOCK_MOVEMENT_REASONS = [
  "shrinkage", // lost / stolen / unaccounted
  "damage", // broken, unsellable
  "correction", // negative stock-count correction
] as const
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number]
