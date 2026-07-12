import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { reconcileStockWorkflow } from "../../../../workflows/accounting"
import type { HardAdjustSchema } from "../validators"

// POST /admin/variant-stock/hard-adjust — hard adjust from the product/variant/inventory pages.
export async function POST(
  req: AuthenticatedMedusaRequest<HardAdjustSchema>,
  res: MedusaResponse
) {
  const { result } = await reconcileStockWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ reconciled: result })
}
