import { model } from "@medusajs/framework/utils"

import { STOCK_BATCH_SOURCES } from "../constants"

/**
 * A STOCK BATCH — one FIFO cost layer. Every production run / restock lands as its own row
 * with its own landed unit cost, because each batch really does cost a different amount to
 * make and ship. Sales consume the OLDEST batch first (FIFO), so COGS reflects what the
 * units that actually shipped cost.
 *
 * This table holds only IMMUTABLE receipt facts: how many came in, on what date, at what
 * cost. It deliberately stores NO "quantity remaining" — remaining, sold and the depletion
 * date are all DERIVED by replaying batches against orders + shrinkage in date order (see
 * lib/insights/fifo-costing.ts). Same principle as the cash ledger: no hand-maintained
 * running total is ever the source of truth, so the books can always be recomputed and proven.
 *
 * Money is stored as-is (800 = 800 BDT), matching Medusa's convention — NOT in cents.
 * `bigNumber` throughout because `model.number()` maps to a Postgres integer and would round
 * a cost of 800.50 down to 800, understating COGS on every order that drew from this batch.
 */
const StockBatch = model
  .define("stock_batch", {
    id: model.id({ prefix: "batch" }).primaryKey(),

    // The variant this batch stocks. Text id, matching the variant_cost convention — no
    // formal module link, so cross-module reads stay simple query.graph joins.
    variant_id: model.text(),
    // Resolved at receive time from the variant's inventory item. Lets us reconcile the
    // derived remaining against Medusa's physical stocked_quantity for this exact item.
    inventory_item_id: model.text().nullable(),
    // The warehouse this batch physically landed in. Today there is one canonical location, so
    // this is the same for every batch — but recording it is what makes multi-warehouse an
    // additive change later instead of a rewrite, and it lets us prove a batch matches the
    // level it is reconciled against.
    location_id: model.text().nullable(),

    // The date the goods arrived — what FIFO orders by, and what every period report keys off.
    received_date: model.dateTime(),

    qty_received: model.bigNumber(),
    // Production/purchase cost per unit BEFORE freight.
    unit_cost: model.bigNumber().default(0),
    // Freight / extra for the WHOLE batch (not per unit).
    freight_total: model.bigNumber().default(0),
    // (unit_cost * qty_received + freight_total) / qty_received, computed once and stored so
    // COGS is stable and does not silently drift if freight allocation ever changes.
    landed_unit_cost: model.bigNumber().default(0),

    currency_code: model.text().default("bdt"),

    // How this layer came in. `restock` pairs with cash; `found` does not. See constants.ts.
    source: model.enum([...STOCK_BATCH_SOURCES]).default("restock"),
    supplier: model.text().nullable(),
    note: model.text().nullable(),

    // The `inventory_purchase` cash row this restock booked. Null for `found`/`opening`
    // batches (no cash moved). Lets an edit re-sync, and a delete remove, exactly its own row.
    ledger_entry_id: model.text().nullable(),
  })
  .indexes([{ on: ["variant_id"] }, { on: ["received_date"] }])

export default StockBatch
