import { model } from "@medusajs/framework/utils"

import { STOCK_MOVEMENT_REASONS } from "../constants"

/**
 * A non-sale stock REDUCTION: shrinkage, damage, or a negative stock-count correction.
 *
 * Why a separate table instead of the ledger or the batches: customer sales and returns are
 * already the source of truth inside Medusa's orders and must never be duplicated here (that
 * is the whole "don't journal what Medusa already knows" rule). But a write-off is invisible
 * to Medusa's order data, so it needs its own durable record to feed the FIFO replay.
 *
 * A movement carries NO cash — a write-off is a non-cash loss. It surfaces in the P&L as a
 * DERIVED figure (shrinkage value at FIFO cost), exactly the way packaging_used already does,
 * so the cash ledger stays purely about money that actually moved. The matching drop in
 * inventory value / net worth happens automatically because the replay consumes these units.
 *
 * Positive-stock corrections ("found stock") are NOT here — those create a `found` batch,
 * because they add a cost layer that later sales can draw from.
 */
const StockMovement = model
  .define("stock_movement", {
    id: model.id({ prefix: "smv" }).primaryKey(),

    variant_id: model.text(),
    // When the stock actually left — what the FIFO replay orders by and reports key off.
    date: model.dateTime(),

    // Always a positive magnitude of units removed. The row's existence carries the "out" sign.
    quantity: model.bigNumber(),

    reason: model.enum([...STOCK_MOVEMENT_REASONS]).default("shrinkage"),
    note: model.text().nullable(),
  })
  .indexes([{ on: ["variant_id"] }, { on: ["date"] }])

export default StockMovement
