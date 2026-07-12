import { model } from "@medusajs/framework/utils"

import { FIXED_ASSET_CATEGORIES } from "../categories"

/**
 * One-time things the business owns: shelving, a camera, a laptop, the packing table.
 *
 * A REGISTER, not a cash account — it answers "what do we own". The cash that bought it
 * lives in `ledger_entry` as a mirrored `fixed_asset` row, written by the same workflow.
 * The dashboard must never add `SUM(fixed_asset.cost)` into cash: that money is already
 * accounted for in the ledger. This table feeds the ASSET side of net worth only.
 *
 * Recorded at what you paid. NO depreciation — a young business is better served by an
 * honest "we spent 12,000 on this and we still own it" than by a book value that needs
 * maintaining. Depreciation can be layered on later without reworking any of this.
 */
const FixedAsset = model
  .define("fixed_asset", {
    id: model.id({ prefix: "fxa" }).primaryKey(),
    name: model.text().searchable(),
    category: model.enum([...FIXED_ASSET_CATEGORIES]).default("equipment"),
    purchase_date: model.dateTime(),

    // The TOTAL paid for this line, not a unit price — so SUM(cost) is the asset value
    // with no multiplication step to get wrong.
    cost: model.bigNumber(),
    currency_code: model.text().default("bdt"),
    quantity: model.number().default(1),

    supplier: model.text().nullable(),
    notes: model.text().nullable(),

    // Sold or scrapped: drops out of asset value, but its original cash row stays in the
    // ledger, because that money really was spent.
    is_disposed: model.boolean().default(false),
    disposed_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["purchase_date"] }, { on: ["is_disposed"] }])

export default FixedAsset
