import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deleteBatchWorkflow,
  editBatchWorkflow,
} from "../../../../../workflows/accounting"
import type { EditBatchSchema } from "../../validators"

// POST /admin/accounting/batches/:id — edit a batch (POST, per the GET/POST/DELETE convention).
export async function POST(
  req: AuthenticatedMedusaRequest<EditBatchSchema>,
  res: MedusaResponse
) {
  const { result } = await editBatchWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  res.json({ batch: result })
}

// DELETE /admin/accounting/batches/:id — remove an un-consumed batch, unwinding stock + cash.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await deleteBatchWorkflow(req.scope).run({
    input: { id: req.params.id },
  })
  res.json({ deleted: true, ...result })
}
