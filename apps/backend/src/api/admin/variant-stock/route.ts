import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { listEnrichedBatches } from "../../../lib/insights/batch-log"
import { getCanonicalLocation } from "../../../lib/inventory/stock-location"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"
import type { GetVariantStockSchema } from "./validators"

/**
 * GET /admin/variant-stock?variant_id=
 *
 * Everything the product-page stock panel needs for ONE variant: the physical quantity on
 * the shelf, its latest cost, its FIFO batches (with remaining/sold/depleted) and its
 * write-off movements — the per-product half of the same data the Accounting tab shows.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetVariantStockSchema>,
  res: MedusaResponse
) {
  const { variant_id } = req.validatedQuery
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const costSvc: any = req.scope.resolve(PRODUCT_COST_MODULE)

  const [batches, movements, costRow] = await Promise.all([
    listEnrichedBatches(req.scope, { variant_id }),
    costSvc.listStockMovements({ variant_id }, { order: { date: "DESC" }, take: 1000 }),
    costSvc
      .listVariantCosts({ variant_id })
      .then((r: any[]) => r[0])
      .catch(() => null),
  ])

  /**
   * Physical stock AT THE CANONICAL LOCATION only — stock in a soft-deleted or unlinked
   * warehouse is not stock this business can sell, and counting it made the panel report
   * permanent phantom drift.
   *
   * `reserved` is held for unfulfilled orders. It does NOT reduce what's on the shelf — that's
   * why placing an order looked like an instant deduction when only "on shelf" was shown.
   */
  const { location, problem } = await getCanonicalLocation(req.scope)

  const { data } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "inventory_items.inventory_item_id",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: { id: variant_id },
  })

  const seen = new Set<string>()
  let currentQty = 0
  let reserved = 0
  for (const link of (data?.[0] as any)?.inventory_items ?? []) {
    const itemId = link.inventory_item_id
    if (!itemId || seen.has(itemId)) continue
    seen.add(itemId)
    for (const lvl of link.inventory?.location_levels ?? []) {
      if (!location || lvl.location_id !== location.id) continue
      currentQty += Number(lvl.stocked_quantity) || 0
      reserved += Number(lvl.reserved_quantity) || 0
    }
  }

  res.json({
    current_qty: currentQty,
    reserved_qty: reserved,
    available_qty: Math.max(0, currentQty - reserved),
    location: location ? { id: location.id, name: location.name } : null,
    setup_problem: problem,
    latest_cost: costRow ? Number(costRow.cost) : 0,
    packaging_cost: costRow ? Number(costRow.packaging_cost) : 0,
    batches,
    movements: (movements ?? []).map((m: any) => ({
      id: m.id,
      date: m.date,
      quantity: Number(m.quantity),
      reason: m.reason,
      note: m.note ?? null,
    })),
  })
}
