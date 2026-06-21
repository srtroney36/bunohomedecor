import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

// Orders that count toward realized sales/profit: fulfilled in some way and not canceled.
const EXCLUDED_FULFILLMENT = new Set(["not_fulfilled", "canceled"])
const PAID_STATUSES = new Set(["captured", "partially_captured"])

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// GET /admin/sales-insights?from=ISO&to=ISO — profit/loss + COD/delivery over FULFILLED orders.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const costSvc = req.scope.resolve(PRODUCT_COST_MODULE)

  const now = new Date()
  const from = req.query.from ? new Date(String(req.query.from)) : monthStart(now)
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(now)
  to.setHours(23, 59, 59, 999)

  // Cost lookup: variant_id -> cost
  const allCosts = await costSvc.listVariantCosts({}, { take: 100000 })
  const costMap = new Map<string, number>(
    allCosts.map((c: any) => [c.variant_id, Number(c.cost) || 0])
  )

  // Pull orders placed in the range
  const orders: any[] = []
  let offset = 0
  for (;;) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id", "status", "fulfillment_status", "payment_status", "currency_code",
        "total", "item_total", "shipping_total", "created_at",
        "items.quantity", "items.variant_id",
      ],
      filters: { created_at: { $gte: from, $lte: to } },
      pagination: { skip: offset, take: 200 },
    })
    orders.push(...data)
    if (data.length < 200) break
    offset += data.length
  }

  const counted = orders.filter(
    (o) => o.status !== "canceled" && !EXCLUDED_FULFILLMENT.has(o.fulfillment_status)
  )

  let productRevenue = 0
  let cogs = 0
  let shippingCollected = 0
  let totalRevenue = 0
  let codPaid = 0
  let codPending = 0
  let currency: string | null = null
  let variantsMissingCost = 0
  const seenMissing = new Set<string>()

  for (const o of counted) {
    currency = currency || o.currency_code
    const itemTotal = Number(o.item_total) || 0
    const total = Number(o.total) || 0
    productRevenue += itemTotal
    shippingCollected += Number(o.shipping_total) || 0
    totalRevenue += total

    for (const it of o.items || []) {
      const vid = it.variant_id
      const qty = Number(it.quantity) || 0
      if (vid && costMap.has(vid)) {
        cogs += (costMap.get(vid) as number) * qty
      } else if (vid && !seenMissing.has(vid)) {
        seenMissing.add(vid)
        variantsMissingCost++
      }
    }

    if (PAID_STATUSES.has(o.payment_status)) codPaid += total
    else codPending += total
  }

  const grossProfit = productRevenue - cogs
  const marginPct = productRevenue > 0 ? (grossProfit / productRevenue) * 100 : 0

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    currency_code: currency,
    counted_orders: counted.length,
    total_orders_in_range: orders.length,
    variants_missing_cost: variantsMissingCost,
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
    },
  })
}
