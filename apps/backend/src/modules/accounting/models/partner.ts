import { model } from "@medusajs/framework/utils"

/**
 * The people who put capital into the business.
 *
 * Deliberately thin. A partner's capital position — invested, drawn, net — is DERIVED by
 * summing their ledger entries, never stored on the row. A stored balance is a cache, and
 * a cache that drifts from the ledger is a number that lies convincingly.
 */
const Partner = model.define("partner", {
  id: model.id({ prefix: "prt" }).primaryKey(),
  name: model.text().searchable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  joined_at: model.dateTime().nullable(),
  notes: model.text().nullable(),
  is_active: model.boolean().default(true),
})

export default Partner
