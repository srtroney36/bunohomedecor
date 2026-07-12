import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { pnlExpenses } from "../../../lib/accounting/ledger-math"
import { computeSalesMetrics, monthStart } from "../../../lib/insights/sales-metrics"
import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { PNL_EXPENSE_CATEGORIES } from "../../../modules/accounting/categories"

/**
 * GET /admin/sales-insights?from=ISO&to=ISO
 *
 * Gross profit (revenue − COGS) comes from Medusa's own orders — that math now lives in
 * lib/insights/sales-metrics.ts so the Accounting dashboard computes it from the same
 * implementation instead of a second copy that drifts.
 *
 * The operating expenses that turn gross profit into NET profit come from the accounting
 * ledger, because Medusa has no idea what you spent on ads or what the courier charged you.
 *
 * Only the four P&L categories are subtracted. Restocks and fixed assets are cash-out but
 * NOT expenses — that money became goods and equipment you still own, and it reaches the
 * P&L later as COGS. Subtracting them here would report a loss every time you restocked.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const now = new Date()
  const from = req.query.from ? new Date(String(req.query.from)) : monthStart(now)
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(now)
  to.setHours(23, 59, 59, 999)

  const base = await computeSalesMetrics(req.scope, { from, to })

  const acct: any = req.scope.resolve(ACCOUNTING_MODULE)
  const rows = await acct.listLedgerEntries(
    {
      category: PNL_EXPENSE_CATEGORIES,
      entry_date: { $gte: from, $lte: to },
    },
    { take: 100000 }
  )
  const exp = pnlExpenses(rows)

  // Packaging consumed by orders in the range is a real cost, derived from orders (not the
  // ledger), so it is added on top of the ledger expenses.
  const packagingUsed = base.metrics.packaging_used
  // Inventory written off in the range (shrinkage/damage), net of `found` stock — a non-cash
  // cost from the FIFO replay, added alongside packaging.
  const inventoryAdjustments = base.metrics.inventory_writeoff - base.metrics.inventory_found
  const operatingExpenses = exp.total + packagingUsed + inventoryAdjustments
  const netProfit = base.metrics.gross_profit - operatingExpenses

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    currency_code: base.currency_code,
    counted_orders: base.counted_orders,
    total_orders_in_range: base.total_orders_in_range,
    variants_missing_cost: base.variants_missing_cost,
    metrics: {
      ...base.metrics,

      // Operating expenses: from the accounting ledger, plus packaging drawn from the pool.
      marketing_spend: exp.marketing,
      courier_cost: exp.courier_fee,
      other_expenses: exp.other_expense,
      refunds: exp.refund,
      packaging_used: packagingUsed,
      inventory_adjustments: inventoryAdjustments,
      operating_expenses: operatingExpenses,

      net_profit: netProfit,
      net_margin_pct:
        base.metrics.product_revenue > 0
          ? (netProfit / base.metrics.product_revenue) * 100
          : 0,
    },
  })
}
