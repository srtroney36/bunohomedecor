import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adjustStockWorkflow } from "../../../../workflows/accounting"
import type { AdjustStockSchema } from "../validators"

/**
 * POST /admin/accounting/adjust — a non-sale stock change.
 *
 *   direction: "found"     → adds a cost layer at `unit_cost`, raises stock, NO cash.
 *   direction: "shrinkage" → writes stock off (records a movement), lowers stock, NO cash.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<AdjustStockSchema>,
  res: MedusaResponse
) {
  const { result } = await adjustStockWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ adjustment: result })
}
