import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { pnlExpenses, summariseLedger } from "../../../../lib/accounting/ledger-math"
import { computeInventoryAtCost } from "../../../../lib/insights/inventory-value"
import {
  allTimeRange,
  computeSalesMetrics,
  monthStart,
} from "../../../../lib/insights/sales-metrics"
import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import type { GetDashboardSchema } from "../validators"

/**
 * GET /admin/accounting/dashboard
 *
 * The numbers the business actually asked for: what we put in, what it's worth now, and
 * where it's sitting.
 *
 * Balance-sheet figures are ALL-TIME. A "net worth for June" is not a quantity that
 * exists. Only the profit block honours ?from&to.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetDashboardSchema>,
  res: MedusaResponse
) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)
  const { from, to } = req.validatedQuery

  const now = new Date()
  const pnlFrom = from ?? monthStart(now)
  const pnlTo = to ?? now
  pnlTo.setHours(23, 59, 59, 999)

  const [lifetimeSales, periodSales, inventory, allRows, ownedAssets] = await Promise.all([
    computeSalesMetrics(req.scope, allTimeRange()),
    computeSalesMetrics(req.scope, { from: pnlFrom, to: pnlTo }),
    computeInventoryAtCost(req.scope),
    svc.listLedgerEntries({}, { take: 200000 }),
    svc.listFixedAssets({ is_disposed: false }, { take: 100000 }),
  ])

  const ledger = summariseLedger(allRows)

  const periodRows = await svc.listLedgerEntries(
    { entry_date: { $gte: pnlFrom, $lte: pnlTo } },
    { take: 100000 }
  )

  const lifetimeExpenses = pnlExpenses(allRows)
  const periodExpenses = pnlExpenses(periodRows)

  const fixed_assets_value = ownedAssets.reduce((s: number, a: any) => s + Number(a.cost), 0)

  /**
   * CASH ON HAND — and the reason revenue is never journaled.
   *
   * `ledger.cash_delta` is only the money WE moved: capital in and out, restocks, assets,
   * ads, courier fees. The money customers handed over is `cod_paid`, which Medusa already
   * knows (and which is already net of anything returned). Add the two and you have cash.
   *
   * Type a customer payment into the ledger as well and you would count it twice.
   */
  const cash_from_sales = lifetimeSales.metrics.cod_paid
  const cod_receivables = lifetimeSales.metrics.cod_pending
  const cash_on_hand = ledger.cash_delta + cash_from_sales

  // "The money that is rolling in the ecommerce": everything not nailed down in equipment —
  // stock on the shelf, cash in the account, and cash a courier still owes us.
  const working_capital = inventory.inventory_at_cost + cash_on_hand + cod_receivables

  const net_worth = fixed_assets_value + working_capital

  // What the business has earned on top of what the partners put in.
  const retained_earnings = net_worth - ledger.total_invested

  const gross = periodSales.metrics.gross_profit
  const net_profit = gross - periodExpenses.total

  res.json({
    currency_code: lifetimeSales.currency_code ?? "bdt",

    // Warn loudly: while any stocked variant has no cost, inventory_at_cost — and therefore
    // net worth — is UNDERSTATED. A quietly wrong net worth is worse than no net worth.
    variants_missing_cost: inventory.variants_missing_cost,
    units_missing_cost: inventory.units_missing_cost,

    headline: {
      net_worth,
      working_capital,
      total_invested: ledger.total_invested,
    },

    assets: {
      inventory_at_cost: inventory.inventory_at_cost,
      units_in_stock: inventory.units_in_stock,
      fixed_assets_value,
      cash_on_hand,
      cod_receivables,
    },

    equity: {
      capital_contributed: ledger.capital_contributed,
      partner_drawings: ledger.partner_drawings,
      total_invested: ledger.total_invested,
      retained_earnings,
    },

    cash_flow: {
      cash_in_from_partners: ledger.capital_contributed,
      cash_in_from_sales: cash_from_sales,
      spent_on_inventory: ledger.inventory_purchases,
      spent_on_fixed_assets: ledger.fixed_asset_purchases,
      spent_on_expenses: lifetimeExpenses.total,
      cash_delta_ledger: ledger.cash_delta,
    },

    profit: {
      range: { from: pnlFrom.toISOString(), to: pnlTo.toISOString() },
      revenue: periodSales.metrics.product_revenue,
      cogs: periodSales.metrics.cogs,
      gross_profit: gross,
      marketing: periodExpenses.marketing,
      courier_fee: periodExpenses.courier_fee,
      other_expense: periodExpenses.other_expense,
      refund: periodExpenses.refund,
      operating_expenses: periodExpenses.total,
      net_profit,
      net_margin_pct:
        periodSales.metrics.product_revenue > 0
          ? (net_profit / periodSales.metrics.product_revenue) * 100
          : 0,
    },
  })
}
