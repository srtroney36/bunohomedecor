import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  deleteLedgerEntryWorkflow,
  updateLedgerEntryWorkflow,
} from "../../../../../workflows/accounting"
import type { UpdateLedgerEntrySchema } from "../../validators"

/**
 * POST /admin/accounting/ledger/:id — edit a cash movement (POST, per the GET/POST/DELETE-only
 * convention). Rows owned by a register are refused with a pointer to the tab that owns them.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<UpdateLedgerEntrySchema>,
  res: MedusaResponse
) {
  const { result } = await updateLedgerEntryWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  res.json({ ledger_entry: result })
}

// DELETE /admin/accounting/ledger/:id — manual rows, plus restock rows with no batch behind them.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deleteLedgerEntryWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "ledger_entry", deleted: true })
}
