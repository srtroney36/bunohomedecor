import { model } from "@medusajs/framework/utils"

// Cost price (COGS) per product variant. Stored in the same as-is scale as prices
// (e.g. 800 = 800 BDT). Drives the Sales Insights profit/loss dashboard and the
// inventory-at-cost figure behind the Accounting net-worth numbers.
//
// `bigNumber`, not `number`: Medusa's DML maps `number` to a Postgres `integer`, which
// silently rounds on write — a cost of 800.50 came back as 800, understating COGS and
// overstating profit on every order containing that variant.
const VariantCost = model.define("variant_cost", {
  id: model.id().primaryKey(),
  variant_id: model.text().unique(),
  cost: model.bigNumber().default(0),
  currency_code: model.text().nullable(),
})

export default VariantCost
