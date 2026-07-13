import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { computeOrderEconomics } from "../../../lib/orders/order-economics"
import { ORDER_STATUSES } from "../../../modules/orderProcessing/constants"

/**
 * GET /admin/order-processing[?status=&issue=&payment=&from=&to=]
 *
 * The ops queue: every order with its derived statuses and its real P&L. Counts per status come
 * back too, so the tabs can show how much work is sitting in each stage.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { status, issue, payment, from, to } = req.query as Record<string, string | undefined>

  const rows = await computeOrderEconomics(req.scope, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
  })

  // Counts are over everything in range, not the filtered view — otherwise the tab you're on
  // would always read "all of them" and the others zero.
  const counts: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
  for (const r of rows) counts[r.order_status] = (counts[r.order_status] ?? 0) + 1

  let filtered = rows
  if (status) filtered = filtered.filter((r) => r.order_status === status)
  if (issue) filtered = filtered.filter((r) => r.issue_status === issue)
  if (payment) filtered = filtered.filter((r) => r.payment_status === payment)

  filtered.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))

  res.json({
    orders: filtered,
    counts,
    total: rows.length,
    totals: {
      revenue: filtered.reduce((s, r) => s + r.product_revenue, 0),
      delivery_charged: filtered.reduce((s, r) => s + r.delivery_charged, 0),
      courier_cost: filtered.reduce((s, r) => s + r.courier_cost, 0),
      delivery_margin: filtered.reduce((s, r) => s + r.delivery_margin, 0),
      cogs: filtered.reduce((s, r) => s + r.cogs, 0),
      packaging: filtered.reduce((s, r) => s + r.packaging, 0),
      write_off: filtered.reduce((s, r) => s + r.write_off, 0),
      net_profit: filtered.reduce((s, r) => s + r.net_profit, 0),
      outstanding: filtered.reduce((s, r) => s + r.outstanding, 0),
      captured: filtered.reduce((s, r) => s + r.captured, 0),
      refunded: filtered.reduce((s, r) => s + r.refunded, 0),
    },
  })
}
