import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deleteMarketingSpendWorkflow,
  updateMarketingSpendWorkflow,
} from "../../../../../workflows/accounting"
import type { UpdateMarketingSpendSchema } from "../../validators"

// POST /admin/accounting/marketing/:id — update; re-syncs the mirrored cash row in place.
export async function POST(
  req: AuthenticatedMedusaRequest<UpdateMarketingSpendSchema>,
  res: MedusaResponse
) {
  const { id } = req.params
  const { result } = await updateMarketingSpendWorkflow(req.scope).run({
    input: { ...req.validatedBody, id },
  })
  res.json({ marketing_spend: result })
}

// DELETE /admin/accounting/marketing/:id — takes its cash row with it.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deleteMarketingSpendWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "marketing_spend", deleted: true })
}
