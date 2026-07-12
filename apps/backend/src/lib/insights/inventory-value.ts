import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCT_COST_MODULE } from "../../modules/productCost"

/**
 * "Money rolling in inventory": SUM(stocked_quantity x variant cost) across every variant.
 *
 * This is one half of what the business calls working capital — cash that is currently
 * sitting on a shelf as vases rather than in a bank account. It is an ASSET, which is why
 * a restock does not reduce profit: the money simply changed shape.
 *
 * Valued at the flat per-variant cost from the productCost module. That is an average, not
 * a FIFO batch valuation — good enough here, and it is the same cost basis Sales Insights
 * uses for COGS, so the two can never disagree with each other.
 */

export type InventoryValuation = {
  inventory_at_cost: number
  units_in_stock: number
  units_missing_cost: number
  /** Variants holding stock with no cost recorded. While > 0, inventory_at_cost is UNDERSTATED. */
  variants_missing_cost: number
}

export async function computeInventoryAtCost(
  container: MedusaContainer
): Promise<InventoryValuation> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const costSvc: any = container.resolve(PRODUCT_COST_MODULE)

  const costs = await costSvc.listVariantCosts({}, { take: 100000 })
  const costMap = new Map<string, number>(
    costs.map((c: any) => [c.variant_id, Number(c.cost) || 0])
  )

  // Two variants can point at the SAME inventory item. Counting stock per-variant would
  // then bill the same physical vases twice and inflate net worth.
  const seenItems = new Set<string>()
  const missing = new Set<string>()

  let value = 0
  let units = 0
  let unitsMissing = 0

  const PAGE = 200
  let skip = 0

  for (;;) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      pagination: { skip, take: PAGE },
    })

    if (!variants?.length) break

    for (const v of variants as any[]) {
      let stock = 0
      for (const link of v.inventory_items ?? []) {
        const itemId = link.inventory_item_id
        if (!itemId || seenItems.has(itemId)) continue
        seenItems.add(itemId)
        for (const lvl of link.inventory?.location_levels ?? []) {
          stock += Number(lvl.stocked_quantity) || 0
        }
      }

      if (stock <= 0) continue
      units += stock

      const cost = costMap.get(v.id)
      if (cost === undefined) {
        missing.add(v.id)
        unitsMissing += stock
        continue
      }
      value += stock * cost
    }

    if (variants.length < PAGE) break
    skip += variants.length
  }

  return {
    inventory_at_cost: value,
    units_in_stock: units,
    units_missing_cost: unitsMissing,
    variants_missing_cost: missing.size,
  }
}
