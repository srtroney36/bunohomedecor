import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deleteFixedAssetWorkflow,
  updateFixedAssetWorkflow,
} from "../../../../../workflows/accounting"
import type { UpdateFixedAssetSchema } from "../../validators"

// POST /admin/accounting/fixed-assets/:id — update; re-syncs the mirrored cash row in place.
export async function POST(
  req: AuthenticatedMedusaRequest<UpdateFixedAssetSchema>,
  res: MedusaResponse
) {
  const { id } = req.params
  const { result } = await updateFixedAssetWorkflow(req.scope).run({
    input: { ...req.validatedBody, id },
  })
  res.json({ fixed_asset: result })
}

// DELETE /admin/accounting/fixed-assets/:id — takes its cash row with it.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deleteFixedAssetWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "fixed_asset", deleted: true })
}
