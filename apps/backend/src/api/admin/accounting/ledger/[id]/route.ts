import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { deleteLedgerEntryWorkflow } from "../../../../../workflows/accounting"

// DELETE /admin/accounting/ledger/:id — only manual rows; mirrored rows belong to their register.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deleteLedgerEntryWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "ledger_entry", deleted: true })
}
