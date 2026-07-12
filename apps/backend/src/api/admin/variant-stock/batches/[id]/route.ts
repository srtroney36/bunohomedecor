import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deleteBatchWorkflow,
  editBatchWorkflow,
} from "../../../../../workflows/accounting"
import type { EditBatchSchema } from "../../validators"

// POST /admin/variant-stock/batches/:id — edit a batch from the product page.
export async function POST(
  req: AuthenticatedMedusaRequest<EditBatchSchema>,
  res: MedusaResponse
) {
  const { result } = await editBatchWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  res.json({ batch: result })
}

// DELETE /admin/variant-stock/batches/:id — delete an un-consumed batch from the product page.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await deleteBatchWorkflow(req.scope).run({
    input: { id: req.params.id },
  })
  res.json({ deleted: true, ...result })
}
