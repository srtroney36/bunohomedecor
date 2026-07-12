import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { reconcileStockWorkflow } from "../../../../workflows/accounting"
import type { HardAdjustSchema } from "../validators"

/**
 * POST /admin/accounting/hard-adjust — "the real count is N".
 *
 * Books the difference honestly (a costed `found` layer, or a write-off at FIFO cost) and
 * then sets the physical quantity, leaving physical == batch-backed == target.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<HardAdjustSchema>,
  res: MedusaResponse
) {
  const { result } = await reconcileStockWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ reconciled: result })
}
