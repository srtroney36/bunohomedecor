import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { listEnrichedBatches } from "../../../../lib/insights/batch-log"
import type { GetBatchesSchema } from "../validators"

/**
 * GET /admin/accounting/batches[?variant_id=]
 *
 * Every FIFO cost layer with its derived state — received, sold, remaining, depleted — for
 * the Accounting "all stock" table and the per-product stock panel. Optionally scoped to one
 * variant.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetBatchesSchema>,
  res: MedusaResponse
) {
  const { variant_id } = req.validatedQuery
  const batches = await listEnrichedBatches(req.scope, { variant_id })
  res.json({ batches })
}
