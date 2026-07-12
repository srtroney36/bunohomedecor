import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ledgerRowGuard } from "../../../../lib/accounting/ledger-guard"
import { summariseLedger } from "../../../../lib/accounting/ledger-math"
import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import { CATEGORY_META } from "../../../../modules/accounting/categories"
import { PRODUCT_COST_MODULE } from "../../../../modules/productCost"
import { createLedgerEntryWorkflow } from "../../../../workflows/accounting"
import type { CreateLedgerEntrySchema, GetLedgerSchema } from "../validators"

// GET /admin/accounting/ledger — the cash book, newest first, with running totals.
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetLedgerSchema>,
  res: MedusaResponse
) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)
  const { from, to, category, direction, partner_id, limit, offset } = req.validatedQuery

  const filters: Record<string, unknown> = {}
  if (category) filters.category = category
  if (direction) filters.direction = direction
  if (partner_id) filters.partner_id = partner_id
  if (from || to) {
    filters.entry_date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    }
  }

  const [entries, count] = await svc.listAndCountLedgerEntries(filters, {
    take: limit,
    skip: offset,
    order: { entry_date: "DESC", id: "DESC" },
  })

  // Totals cover the whole filtered set, not just the page being shown — a page-local
  // total would silently change every time someone paged.
  const all = await svc.listLedgerEntries(filters, { take: 100000 })
  const summary = summariseLedger(all)

  /**
   * Which rows may the Cash Book edit/delete? A `restock` row is normally locked to its stock
   * batch, so we look up which of these rows actually have one. An orphan (cash with no batch —
   * a leftover from before batches existed) is free to fix or remove.
   */
  const costSvc: any = req.scope.resolve(PRODUCT_COST_MODULE)
  const restockIds = entries
    .filter((e: any) => e.source_type === "restock")
    .map((e: any) => e.id)

  const backed = new Set<string>()
  if (restockIds.length) {
    const batches = await costSvc.listStockBatches(
      { ledger_entry_id: restockIds },
      { take: 100000 }
    )
    for (const b of batches) backed.add(b.ledger_entry_id)
  }

  res.json({
    ledger_entries: entries.map((e: any) => {
      const guard = ledgerRowGuard(e.source_type, backed.has(e.id))
      return {
        ...e,
        amount: Number(e.amount),
        klass: CATEGORY_META[e.category as keyof typeof CATEGORY_META]?.klass ?? "expense",
        category_label:
          CATEGORY_META[e.category as keyof typeof CATEGORY_META]?.label ?? e.category,
        can_edit: guard.can_edit,
        can_delete: guard.can_delete,
        locked_reason: guard.reason,
      }
    }),
    count,
    limit,
    offset,
    summary,
  })
}

// POST /admin/accounting/ledger — record a cash movement.
export async function POST(
  req: AuthenticatedMedusaRequest<CreateLedgerEntrySchema>,
  res: MedusaResponse
) {
  const { result } = await createLedgerEntryWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.status(201).json({ ledger_entry: result })
}
