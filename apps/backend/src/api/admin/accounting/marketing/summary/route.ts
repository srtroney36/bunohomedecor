import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ACCOUNTING_MODULE } from "../../../../../modules/accounting"
import { MARKETING_PLATFORM_LABELS } from "../../../../../modules/accounting/categories"
import type { GetMarketingSummarySchema } from "../../validators"

// Sorts as YYYY-MM, which is also chronological. Local time, matching how the spend was entered.
const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

/**
 * GET /admin/accounting/marketing/summary?group_by=month|platform|campaign
 *
 * "Marketing costs per month" — the headline the business asked for.
 *
 * Static segment, so it is matched ahead of /marketing/:id by the file router. Don't name
 * a spend "summary".
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetMarketingSummarySchema>,
  res: MedusaResponse
) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)
  const { from, to, group_by } = req.validatedQuery

  const filters: Record<string, unknown> = {}
  if (from || to) {
    filters.spend_date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    }
  }

  const spends = await svc.listMarketingSpends(filters, { take: 100000 })

  const buckets = new Map<string, { key: string; label: string; amount: number; count: number }>()

  for (const s of spends) {
    const amount = Number(s.amount) || 0
    const date = new Date(s.spend_date)

    let key: string
    let label: string
    if (group_by === "platform") {
      key = s.platform
      label = MARKETING_PLATFORM_LABELS[s.platform as keyof typeof MARKETING_PLATFORM_LABELS] ?? s.platform
    } else if (group_by === "campaign") {
      key = s.campaign || "(no campaign)"
      label = key
    } else {
      key = monthKey(date)
      label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    }

    const b = buckets.get(key) ?? { key, label, amount: 0, count: 0 }
    b.amount += amount
    b.count += 1
    buckets.set(key, b)
  }

  const groups = [...buckets.values()].sort((a, b) =>
    group_by === "month" ? a.key.localeCompare(b.key) : b.amount - a.amount
  )

  res.json({
    group_by,
    groups,
    total: groups.reduce((s, g) => s + g.amount, 0),
    count: spends.length,
  })
}
