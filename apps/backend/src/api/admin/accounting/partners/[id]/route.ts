import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deletePartnerWorkflow,
  updatePartnerWorkflow,
} from "../../../../../workflows/accounting"
import type { UpdatePartnerSchema } from "../../validators"

// POST /admin/accounting/partners/:id — update (Medusa admin routes use POST, never PATCH).
export async function POST(
  req: AuthenticatedMedusaRequest<UpdatePartnerSchema>,
  res: MedusaResponse
) {
  const { id } = req.params
  const { result } = await updatePartnerWorkflow(req.scope).run({
    input: { ...req.validatedBody, id },
  })
  res.json({ partner: result })
}

// DELETE /admin/accounting/partners/:id — refused if they have capital in the pool.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deletePartnerWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "partner", deleted: true })
}
