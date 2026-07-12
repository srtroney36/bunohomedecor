import { model } from "@medusajs/framework/utils"

import { LEDGER_CATEGORIES, LEDGER_SOURCE_TYPES } from "../categories"

/**
 * THE CASH LEDGER. The single accumulator for money the business moved.
 *
 * Every figure the Accounting dashboard reports is a SUM over this table (plus what
 * Medusa knows). No running total is ever the source of truth, so the books can always be
 * recomputed from scratch and proven.
 *
 * Money is stored as-is (800 = 800 BDT), matching Medusa's convention — NOT in cents.
 * `bigNumber` because `model.number()` maps to a Postgres integer and would round.
 */
const LedgerEntry = model
  .define("ledger_entry", {
    id: model.id({ prefix: "led" }).primaryKey(),

    // The date the money actually moved, which is not necessarily when it was typed in.
    // Every period report keys off this, never off created_at.
    entry_date: model.dateTime(),

    // Derived from the category, never accepted from the client. See CATEGORY_META.
    direction: model.enum(["in", "out"]),
    category: model.enum([...LEDGER_CATEGORIES]),

    // Always a positive magnitude. `direction` carries the sign.
    amount: model.bigNumber(),
    currency_code: model.text().default("bdt"),

    description: model.text().nullable(),
    reference: model.text().nullable(),

    // Required for the equity categories (capital_contribution / partner_drawing).
    partner_id: model.text().nullable(),

    // Rows mirrored from a register table (Fixed Assets, Marketing) carry their origin, so
    // the register can re-sync or remove exactly its own row and nothing else.
    source_type: model.enum([...LEDGER_SOURCE_TYPES]).default("manual"),
    source_id: model.text().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["entry_date"] },
    { on: ["category"] },
    {
      on: ["partner_id"],
      where: "partner_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      // Makes the register -> ledger sync idempotent: editing a fixed asset updates its one
      // mirrored row instead of appending a second one, even if the workflow step retries.
      on: ["source_type", "source_id"],
      unique: true,
      where: "source_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])

export default LedgerEntry
