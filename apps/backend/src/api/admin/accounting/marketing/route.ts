import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import { createMarketingSpendWorkflow } from "../../../../workflows/accounting"
import type { CreateMarketingSpendSchema, GetMarketingListSchema } from "../validators"

// GET /admin/accounting/marketing
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetMarketingListSchema>,
  res: MedusaResponse
) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)
  const { from, to, platform, limit, offset } = req.validatedQuery

  const filters: Record<string, unknown> = {}
  if (platform) filters.platform = platform
  if (from || to) {
    filters.spend_date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    }
  }

  const [spends, count] = await svc.listAndCountMarketingSpends(filters, {
    take: limit,
    skip: offset,
    order: { spend_date: "DESC" },
  })

  const all = await svc.listMarketingSpends(filters, { take: 100000 })
  const total = all.reduce((s: number, m: any) => s + Number(m.amount), 0)

  res.json({
    marketing_spends: spends.map((m: any) => ({ ...m, amount: Number(m.amount) })),
    count,
    limit,
    offset,
    total,
  })
}

// POST /admin/accounting/marketing — also writes the mirrored cash row (a real P&L expense).
export async function POST(
  req: AuthenticatedMedusaRequest<CreateMarketingSpendSchema>,
  res: MedusaResponse
) {
  const { result } = await createMarketingSpendWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.status(201).json({ marketing_spend: result })
}
