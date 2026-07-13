import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { getCanonicalLocation } from "../inventory/stock-location"
import { computeFifoCosting } from "./fifo-costing"

/**
 * "Money rolling in inventory": the value of stock still on the shelf.
 *
 * Valued by FIFO — Σ(units remaining in each batch × that batch's landed cost) — from the one
 * costing engine that also produces COGS, so the two can never disagree.
 *
 * We still read Medusa's PHYSICAL stock, but only to RECONCILE — and ONLY at the canonical
 * stock location. Summing every level across every location (as this used to) counted stock
 * sitting in soft-deleted warehouses as real, which made the drift warning fire permanently on
 * a store that was actually fine.
 */

export type InventoryValuation = {
  inventory_at_cost: number
  units_in_stock: number
  units_missing_cost: number
  /** Variants whose physical stock exceeds what batches account for. While > 0, understated. */
  variants_missing_cost: number
}

export async function computeInventoryAtCost(
  container: MedusaContainer
): Promise<InventoryValuation> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const fifo = await computeFifoCosting(container)
  const remainingByVariant = new Map<string, number>()
  for (const b of fifo.per_batch) {
    remainingByVariant.set(
      b.variant_id,
      (remainingByVariant.get(b.variant_id) ?? 0) + b.remaining
    )
  }

  const base: InventoryValuation = {
    inventory_at_cost: fifo.inventory_at_cost,
    units_in_stock: fifo.units_in_stock,
    units_missing_cost: 0,
    variants_missing_cost: 0,
  }

  // No canonical location (broken setup) → we can't reconcile against anything. The health
  // check reports that separately; don't invent a drift number here.
  const { location } = await getCanonicalLocation(container)
  if (!location) return base

  const seenItems = new Set<string>()
  const missing = new Set<string>()
  let unitsMissing = 0

  const PAGE = 200
  let skip = 0
  for (;;) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      pagination: { skip, take: PAGE },
    })

    if (!variants?.length) break

    for (const v of variants as any[]) {
      let physical = 0
      for (const link of v.inventory_items ?? []) {
        const itemId = link.inventory_item_id
        if (!itemId || seenItems.has(itemId)) continue
        seenItems.add(itemId)
        for (const lvl of link.inventory?.location_levels ?? []) {
          // ONLY the canonical warehouse counts as real stock.
          if (lvl.location_id !== location.id) continue
          physical += Number(lvl.stocked_quantity) || 0
        }
      }

      const backed = remainingByVariant.get(v.id) ?? 0
      if (physical > backed) {
        unitsMissing += physical - backed
        missing.add(v.id)
      }
    }

    if (variants.length < PAGE) break
    skip += variants.length
  }

  return {
    ...base,
    units_missing_cost: unitsMissing,
    variants_missing_cost: missing.size,
  }
}
