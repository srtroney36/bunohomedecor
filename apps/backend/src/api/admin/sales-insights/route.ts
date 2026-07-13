import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { pnlExpenses, pnlIncome } from "../../../lib/accounting/ledger-math"
import { monthStart } from "../../../lib/insights/sales-metrics"
import { computeOrderEconomics } from "../../../lib/orders/order-economics"
import { ACCOUNTING_MODULE } from "../../../modules/accounting"

/**
 * GET /admin/sales-insights?from=ISO&to=ISO
 *
 * The real economics, built from the per-order P&L rather than a pile of aggregates — because
 * "we made 40% margin" means nothing if every parcel loses money on delivery.
 *
 * The courier fee now lives on the order, so DELIVERY MARGIN (what the customer paid to receive
 * it, minus what carrying it actually cost) is finally a number you can see.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const now = new Date()
  const from = req.query.from ? new Date(String(req.query.from)) : monthStart(now)
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(now)
  to.setHours(23, 59, 59, 999)

  const orders = await computeOrderEconomics(req.scope, { from, to })

  const sum = (f: (o: (typeof orders)[number]) => number) => orders.reduce((s, o) => s + f(o), 0)

  const product_revenue = sum((o) => o.product_revenue)
  const delivery_charged = sum((o) => o.delivery_charged)
  const cogs = sum((o) => o.cogs)
  const packaging = sum((o) => o.packaging)
  const courier_cost = sum((o) => o.courier_cost)
  const write_off = sum((o) => o.write_off)

  const gross_profit = product_revenue - cogs
  const delivery_margin = delivery_charged - courier_cost

  // Expenses the ledger owns and no order knows about: ads, rent, salaries.
  const acct: any = req.scope.resolve(ACCOUNTING_MODULE)
  const rows = await acct.listLedgerEntries(
    { entry_date: { $gte: from, $lte: to } },
    { take: 100000 }
  )
  const exp = pnlExpenses(rows)
  const other_income = pnlIncome(rows)

  /**
   * Both courier fees AND production costs are booked per order and already counted here —
   * courier_fee inside `courier_cost`, production_cost inside `cogs`. They also land in the
   * ledger (that's how the accounting dashboard sees them), so we strip both from ledger
   * overhead or every pre-order/custom order would be charged for its production twice.
   */
  const overhead = exp.total - exp.courier_fee - exp.production_cost

  const net_profit =
    gross_profit + delivery_margin + other_income - packaging - write_off - overhead

  const countBy = <K extends string>(f: (o: (typeof orders)[number]) => K) => {
    const m: Record<string, number> = {}
    for (const o of orders) m[f(o)] = (m[f(o)] ?? 0) + 1
    return m
  }

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    currency_code: orders[0]?.currency_code ?? "bdt",
    order_count: orders.length,

    revenue: {
      product: product_revenue,
      delivery_charged,
      total: product_revenue + delivery_charged,
    },

    costs: {
      cogs,
      packaging,
      courier: courier_cost,
      write_off,
      overhead,
      marketing: exp.marketing,
      other_expense: exp.other_expense,
      refunds: exp.refund,
    },

    profit: {
      gross_profit,
      /** What delivery made or lost. Negative means you are paying to ship. */
      delivery_margin,
      other_income,
      net_profit,
      net_margin_pct: product_revenue > 0 ? (net_profit / product_revenue) * 100 : 0,
    },

    cash: {
      captured: sum((o) => o.captured),
      refunded: sum((o) => o.refunded),
      /** COD still sitting with the courier or the customer. */
      outstanding: sum((o) => o.outstanding),
    },

    breakdown: {
      by_status: countBy((o) => o.order_status),
      by_payment: countBy((o) => o.payment_status),
      by_issue: countBy((o) => o.issue_status),
    },

    /** The parcels that lost money — the whole point of a per-order P&L. */
    loss_making: orders
      .filter((o) => o.net_profit < 0)
      .sort((a, b) => a.net_profit - b.net_profit)
      .slice(0, 10),
  })
}
