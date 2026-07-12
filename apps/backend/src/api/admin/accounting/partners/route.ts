import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import { summarisePartners } from "../../../../lib/accounting/ledger-math"
import { createPartnerWorkflow } from "../../../../workflows/accounting"
import type { CreatePartnerSchema } from "../validators"

// GET /admin/accounting/partners — the investment pool, each partner's position derived
// from the ledger rather than stored on the row.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)

  const partners = await svc.listPartners({}, { take: 1000, order: { created_at: "ASC" } })
  const equityRows = await svc.listLedgerEntries(
    { category: ["capital_contribution", "partner_drawing"] },
    { take: 100000 }
  )

  const positions = summarisePartners(equityRows)

  const enriched = partners.map((p: any) => {
    const pos = positions.get(p.id)
    return {
      ...p,
      invested: pos?.invested ?? 0,
      drawn: pos?.drawn ?? 0,
      net: pos?.net ?? 0,
    }
  })

  res.json({
    partners: enriched,
    count: enriched.length,
    totals: {
      capital_contributed: enriched.reduce((s: number, p: any) => s + p.invested, 0),
      partner_drawings: enriched.reduce((s: number, p: any) => s + p.drawn, 0),
      total_invested: enriched.reduce((s: number, p: any) => s + p.net, 0),
    },
  })
}

// POST /admin/accounting/partners
export async function POST(
  req: AuthenticatedMedusaRequest<CreatePartnerSchema>,
  res: MedusaResponse
) {
  const { result } = await createPartnerWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ partner: result })
}
