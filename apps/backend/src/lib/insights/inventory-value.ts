import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { computeFifoCosting } from "./fifo-costing"

/**
 * "Money rolling in inventory": the value of stock still on the shelf.
 *
 * Now valued by FIFO — Σ(units remaining in each batch × that batch's landed cost) — via the
 * one costing engine that also produces COGS, so inventory value and COGS can never disagree.
 * The old flat-per-variant average is gone.
 *
 * We still read Medusa's PHYSICAL stock, but only to RECONCILE: any physical units a batch
 * does not account for (e.g. stock typed straight into the native "Manage location quantity"
 * screen, which books no batch) mean inventory_at_cost is UNDERSTATED. That drift is exactly
 * what `units_missing_cost` / `variants_missing_cost` now surface.
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

  // All-time FIFO state: value + units remaining, and per-batch remaining to fold per variant.
  const fifo = await computeFifoCosting(container)
  const remainingByVariant = new Map<string, number>()
  for (const b of fifo.per_batch) {
    remainingByVariant.set(
      b.variant_id,
      (remainingByVariant.get(b.variant_id) ?? 0) + b.remaining
    )
  }

  // Physical stock per variant. Two variants can share ONE inventory item; dedupe by item so
  // the same physical units aren't reconciled twice.
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
    inventory_at_cost: fifo.inventory_at_cost,
    units_in_stock: fifo.units_in_stock,
    units_missing_cost: unitsMissing,
    variants_missing_cost: missing.size,
  }
}
