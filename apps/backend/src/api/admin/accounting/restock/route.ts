import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { restockWorkflow } from "../../../../workflows/accounting"
import type { RestockSchema } from "../validators"

// POST /admin/accounting/restock — raise stock AND book the cash in one action.
export async function POST(
  req: AuthenticatedMedusaRequest<RestockSchema>,
  res: MedusaResponse
) {
  const { result } = await restockWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ restock: result })
}
