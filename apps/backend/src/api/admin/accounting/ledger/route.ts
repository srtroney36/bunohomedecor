import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import { CATEGORY_META } from "../../../../modules/accounting/categories"
import { summariseLedger } from "../../../../lib/accounting/ledger-math"
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

  res.json({
    ledger_entries: entries.map((e: any) => ({
      ...e,
      amount: Number(e.amount),
      klass: CATEGORY_META[e.category as keyof typeof CATEGORY_META]?.klass ?? "expense",
      category_label: CATEGORY_META[e.category as keyof typeof CATEGORY_META]?.label ?? e.category,
    })),
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
