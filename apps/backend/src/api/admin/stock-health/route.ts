import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { inspectStockHealth } from "../../../lib/inventory/stock-health"

/**
 * GET /admin/stock-health
 *
 * Is the store physically able to sell what it stocks, and do the books agree with the shelf?
 * Detection only — nothing here changes data.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const health = await inspectStockHealth(req.scope)
  res.json(health)
}
