import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { pnlExpenses, pnlIncome, summariseLedger } from "../../../../lib/accounting/ledger-math"
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
   * THE PACKAGING POOL — money tied up in boxes, tape and wrap you are still holding.
   *
   * Bought comes from the ledger (a cash->asset swap). Used is DERIVED from orders (each
   * non-cancelled order drew its per-unit presets when placed). The pool is what's left.
   *
   * A NEGATIVE pool is not a bug — it is the signal this exists to give: your per-product
   * packaging presets are lower than what packaging is really costing you. Raise them.
   */
  const packaging_bought = ledger.packaging_purchases
  const packaging_used_lifetime = lifetimeSales.metrics.packaging_used
  const packaging_pool = packaging_bought - packaging_used_lifetime

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
  // stock on the shelf, packaging in the pool, cash in the account, and cash a courier owes us.
  const working_capital =
    inventory.inventory_at_cost + packaging_pool + cash_on_hand + cod_receivables

  const net_worth = fixed_assets_value + working_capital

  // What the business has earned on top of what the partners put in.
  const retained_earnings = net_worth - ledger.total_invested

  // Packaging consumed by orders placed in the period is a real cost (the boxes are gone),
  // so it reduces net profit alongside the ledger expenses.
  const packaging_used_period = periodSales.metrics.packaging_used
  // Inventory written off in the period (shrinkage/damage), net of any `found` stock. A
  // non-cash P&L cost derived from the FIFO replay, exactly like packaging.
  const inventory_adjustments =
    periodSales.metrics.inventory_writeoff - periodSales.metrics.inventory_found
  const gross = periodSales.metrics.gross_profit

  /**
   * DELIVERY IS BOTH SIDES OF A TRADE, and this used to only count one of them.
   *
   * The courier fee sat in operating expenses, but what the customer PAID for delivery was left
   * out of revenue entirely — so every parcel looked like a pure cost and net profit was
   * understated by the whole delivery charge. Charge ৳100, pay the courier ৳60, and the books
   * were showing −৳60 instead of +৳40.
   */
  const delivery_charged = periodSales.metrics.shipping_collected
  const courier_cost = periodExpenses.courier_fee
  const delivery_margin = delivery_charged - courier_cost

  // Money in that isn't a sale — courier compensation for a destroyed parcel, scrap. Real income.
  const other_income = pnlIncome(periodRows)
  const operating_expenses = periodExpenses.total + packaging_used_period + inventory_adjustments
  const net_profit = gross + delivery_charged + other_income - operating_expenses

  res.json({
    currency_code: lifetimeSales.currency_code ?? "bdt",

    // Warn loudly: while any stocked variant has no cost, inventory_at_cost — and therefore
    // net worth — is UNDERSTATED. A quietly wrong net worth is worse than no net worth.
    variants_missing_cost: inventory.variants_missing_cost,
    units_missing_cost: inventory.units_missing_cost,

    // Revenue counts a part-shipped order in full while COGS counts only what shipped, so the
    // margin is provisional until the rest goes out. Say so rather than quietly overstate it.
    partially_fulfilled_orders: periodSales.partially_fulfilled_orders,

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
      packaging_pool,
    },

    packaging: {
      bought: packaging_bought,
      used: packaging_used_lifetime,
      pool: packaging_pool,
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
      packaging_used: packaging_used_period,
      inventory_adjustments,
      other_income,
      // Delivery, both sides — so you can see whether carrying parcels makes or loses money.
      delivery_charged,
      courier_cost,
      delivery_margin,
      operating_expenses,
      net_profit,
      net_margin_pct:
        periodSales.metrics.product_revenue > 0
          ? (net_profit / periodSales.metrics.product_revenue) * 100
          : 0,
    },
  })
}
