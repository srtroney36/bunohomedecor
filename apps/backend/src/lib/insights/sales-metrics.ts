import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCT_COST_MODULE } from "../../modules/productCost"
import { computeFifoCosting, EXCLUDED_FULFILLMENT } from "./fifo-costing"

/**
 * Revenue / COGS / gross profit over Medusa's own orders.
 *
 * Revenue, returns, COD and packaging are computed here from Medusa's orders. COGS is NOT —
 * it now comes from the FIFO engine (lib/insights/fifo-costing.ts), so cost-of-goods and
 * the value of stock on the shelf are two reads of the SAME batch replay and can't drift.
 *
 * `EXCLUDED_FULFILLMENT` is imported from the engine so "orders we book revenue on" and
 * "orders that drew down a batch" are guaranteed to be the identical set.
 */

// (No PAID_STATUSES set any more — cash comes from the captured payments themselves. A status
// flag can't tell you HOW MUCH was captured, which is exactly what an advance payment needs.)

export type SalesRange = { from: Date; to: Date }

export type SalesMetrics = {
  total_revenue: number
  product_revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number
  shipping_collected: number
  cod_paid: number
  cod_pending: number
  avg_order_value: number
  returned_orders: number
  returned_value: number
  // Packaging drawn from the pool: every non-cancelled order draws (unit preset x quantity)
  // when it is placed. Not netted for returns — the box is spent even if the goods come back.
  packaging_used: number
  // Non-cash inventory write-off (shrinkage/damage) at FIFO cost, for stock lost in range.
  // A real cost that reduces net profit, the same way packaging_used does.
  inventory_writeoff: number
  // Value of `found` stock added in range — a non-cash gain that nets against write-offs.
  inventory_found: number
}

export type SalesMetricsResult = {
  currency_code: string | null
  counted_orders: number
  total_orders_in_range: number
  variants_missing_cost: number
  /**
   * Part-shipped orders. Revenue counts them IN FULL but COGS only counts what actually left
   * the shelf, so their margin reads high until the rest ships. Reported so the overstatement
   * is visible rather than silent.
   */
  partially_fulfilled_orders: number
  metrics: SalesMetrics
}

export function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** Everything, from the first order ever placed. Used for balance-sheet figures. */
export function allTimeRange(): SalesRange {
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  return { from: new Date(0), to }
}

export async function computeSalesMetrics(
  container: MedusaContainer,
  range: SalesRange
): Promise<SalesMetricsResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const costSvc: any = container.resolve(PRODUCT_COST_MODULE)

  const { from, to } = range

  // COGS + the missing-cost warning now come from the FIFO batch replay, not a flat cost.
  const fifo = await computeFifoCosting(container, { from, to })

  // Packaging-preset lookup stays here — packaging is still a flat per-variant preset.
  const allCosts = await costSvc.listVariantCosts({}, { take: 100000 })
  const packagingMap = new Map<string, number>(
    allCosts.map((c: any) => [c.variant_id, Number(c.packaging_cost) || 0])
  )

  /**
   * Orders in the range — fetched as TWO queries, deliberately.
   *
   * Asking query.graph for an order's TOTALS and its ITEMS in the same call silently corrupts
   * the totals: `item_total` comes back as 0 and `total` collapses to just the shipping. Not an
   * error — a wrong number, which is how this store came to report zero product revenue.
   *
   * So: totals on their own, items on their own, joined by id. Never merge these two field sets.
   */
  const filters = { created_at: { $gte: from, $lte: to } }
  const PAGE = 200

  const paged = async (fields: string[]): Promise<any[]> => {
    const out: any[] = []
    let offset = 0
    for (;;) {
      const { data } = await query.graph({
        entity: "order",
        fields,
        filters,
        pagination: { skip: offset, take: PAGE },
      })
      out.push(...data)
      if (data.length < PAGE) break
      offset += data.length
    }
    return out
  }

  const [totalsRows, itemRows] = await Promise.all([
    paged([
      "id", "status", "fulfillment_status", "payment_status", "currency_code", "created_at",
      "total", "item_total", "shipping_total",
    ]),
    paged([
      "id",
      "items.id", "items.quantity", "items.variant_id", "items.unit_price",
      "returns.id", "returns.items.item_id", "returns.items.quantity",
      // Cash that ACTUALLY moved. See the codPaid note below for why the payment_status flag
      // is not good enough.
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.refunds.amount",
    ]),
  ])

  const itemsById = new Map<string, any>(itemRows.map((r: any) => [r.id, r]))
  const orders: any[] = totalsRows.map((t: any) => ({
    ...t,
    items: itemsById.get(t.id)?.items ?? [],
    returns: itemsById.get(t.id)?.returns ?? [],
    payment_collections: itemsById.get(t.id)?.payment_collections ?? [],
  }))

  const counted = orders.filter(
    (o) => o.status !== "canceled" && !EXCLUDED_FULFILLMENT.has(o.fulfillment_status)
  )

  let productRevenue = 0
  let shippingCollected = 0
  let totalRevenue = 0
  let codPaid = 0
  let codPending = 0
  let currency: string | null = null
  let returnedOrders = 0
  let returnedValue = 0 // product revenue of returned items

  // Item revenue of the quantities returned on an order — netted out of revenue since the
  // goods came back. (COGS of returns is handled inside the FIFO engine, which nets returns
  // out of the quantity a batch is charged for.)
  const returnedRevenue = (o: any): { revenue: number; hasReturn: boolean } => {
    const itemById = new Map<string, any>((o.items ?? []).map((it: any) => [it.id, it]))
    let revenue = 0
    for (const ret of o.returns ?? []) {
      for (const ri of ret.items ?? []) {
        const it = itemById.get(ri.item_id)
        const q = Number(ri.quantity) || 0
        if (!it || q <= 0) continue
        revenue += (Number(it.unit_price) || 0) * q
      }
    }
    return { revenue, hasReturn: (o.returns?.length ?? 0) > 0 }
  }

  for (const o of counted) {
    currency = currency || o.currency_code
    const itemTotal = Number(o.item_total) || 0
    const total = Number(o.total) || 0

    // Net out anything returned — the product came back to stock.
    const ret = returnedRevenue(o)
    const netItem = Math.max(0, itemTotal - ret.revenue)
    const netTotal = Math.max(0, total - ret.revenue)
    if (ret.hasReturn) {
      returnedOrders++
      returnedValue += ret.revenue
    }

    productRevenue += netItem
    shippingCollected += Number(o.shipping_total) || 0
    totalRevenue += netTotal

    /**
     * CASH — from the money that actually moved, not from a status flag.
     *
     * This used to read `payment_status`, and treat "partially_captured" as fully paid: a ৳500
     * advance on a ৳2,500 order booked the whole ৳2,500 as cash in hand. With advance payments
     * that overstated cash — and therefore net worth — by ৳2,000 an order.
     *
     * A Medusa payment is captured in full or not at all, so a captured payment's amount IS the
     * cash. Whatever is left of the total is still owed (the COD the courier hasn't handed over).
     */
    let captured = 0
    let refunded = 0
    for (const pc of o.payment_collections ?? []) {
      for (const p of pc.payments ?? []) {
        if (p.captured_at && !p.canceled_at) captured += Number(p.amount) || 0
        for (const r of p.refunds ?? []) refunded += Number(r.amount) || 0
      }
    }

    codPaid += Math.max(0, captured - refunded)
    codPending += Math.max(0, netTotal - captured)
  }

  const cogs = Math.max(0, fifo.cogs_in_range)
  const variantsMissingCost = fifo.variants_uncosted
  const grossProfit = productRevenue - cogs
  const marginPct = productRevenue > 0 ? (grossProfit / productRevenue) * 100 : 0

  // PACKAGING USED — drawn "when placed", so this counts EVERY non-cancelled order, not
  // just the fulfilled ones that count toward revenue. Full quantity, no return netting:
  // once a parcel is packed, that packaging is spent regardless of what happens next.
  let packagingUsed = 0
  for (const o of orders) {
    if (o.status === "canceled" || o.status === "draft") continue
    for (const it of o.items || []) {
      const preset = packagingMap.get(it.variant_id)
      if (preset) packagingUsed += preset * (Number(it.quantity) || 0)
    }
  }

  return {
    currency_code: currency,
    counted_orders: counted.length,
    total_orders_in_range: orders.length,
    variants_missing_cost: variantsMissingCost,
    partially_fulfilled_orders: fifo.partially_fulfilled_orders,
    metrics: {
      total_revenue: totalRevenue,
      product_revenue: productRevenue,
      cogs,
      gross_profit: grossProfit,
      margin_pct: marginPct,
      shipping_collected: shippingCollected,
      cod_paid: codPaid,
      cod_pending: codPending,
      avg_order_value: counted.length ? totalRevenue / counted.length : 0,
      returned_orders: returnedOrders,
      returned_value: returnedValue,
      packaging_used: packagingUsed,
      inventory_writeoff: fifo.shrinkage_value_in_range,
      inventory_found: fifo.found_value_in_range,
    },
  }
}
