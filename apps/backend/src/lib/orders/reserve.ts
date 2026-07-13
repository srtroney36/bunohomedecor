import { createReservationsWorkflow } from "@medusajs/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { requireSellableLocation } from "../inventory/stock-location"

/**
 * RESERVING STOCK FOR AN ORDER — the thing `createOrderWorkflow` does not do.
 *
 * A storefront order goes through `completeCartWorkflow`, which reserves inventory. An order
 * created in the admin goes through `createOrderWorkflow`, which does NOT. That single gap
 * caused both of the bugs seen here:
 *
 *   1. Manual orders showed no allocation, because no reservation ever existed.
 *   2. Stock went NEGATIVE (−49). With no reservation, nothing had checked that the stock was
 *      there, so when the order was fulfilled Medusa simply subtracted — straight through zero.
 *
 * A reservation is not bookkeeping. It is the thing that makes "do we actually have these?" a
 * question that gets asked at all.
 */

export type StockLine = { variant_id: string; quantity: number; title?: string }

export type AvailabilityProblem = {
  variant_id: string
  title: string
  requested: number
  available: number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Variant → its inventory item + whether stock is even tracked for it. */
async function loadVariantInventoryMap(container: MedusaContainer, variantIds: string[]) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "manage_inventory",
      "allow_backorder",
      "inventory_items.inventory_item_id",
      // How many INVENTORY units one of these eats. Usually 1, but Medusa allows a variant to
      // consume N (an inventory kit). Ignore it and you reserve 1 unit for something that
      // actually takes 50 off the shelf — which is how stock reaches −95.
      "inventory_items.required_quantity",
    ],
    filters: { id: variantIds },
  })

  const map = new Map<
    string,
    {
      itemId: string | null
      manage: boolean
      backorder: boolean
      title: string
      required: number
    }
  >()
  for (const v of (data ?? []) as any[]) {
    const req = num(v.inventory_items?.[0]?.required_quantity)
    map.set(v.id, {
      itemId: v.inventory_items?.[0]?.inventory_item_id ?? null,
      manage: v.manage_inventory !== false,
      backorder: !!v.allow_backorder,
      title: v.title ?? v.id,
      required: req > 0 ? req : 1,
    })
  }
  return map
}

/**
 * Is there actually enough stock? Available = stocked − already reserved, at the one warehouse
 * we operate from.
 *
 * Called BEFORE an order is created, so we refuse to take an order we can't fill rather than
 * discovering it when the stock has already gone negative.
 */
export async function checkAvailability(
  container: MedusaContainer,
  lines: StockLine[]
): Promise<AvailabilityProblem[]> {
  if (!lines.length) return []

  const location = await requireSellableLocation(container)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const variants = await loadVariantInventoryMap(
    container,
    lines.map((l) => l.variant_id)
  )

  const problems: AvailabilityProblem[] = []

  for (const line of lines) {
    const v = variants.get(line.variant_id)
    // Not stock-tracked, or deliberately allowed to go on backorder — nothing to check.
    if (!v || !v.manage || v.backorder || !v.itemId) continue

    const [level] = await inventory.listInventoryLevels({
      inventory_item_id: v.itemId,
      location_id: location.id,
    })

    const available = num(level?.stocked_quantity) - num(level?.reserved_quantity)
    // The shelf is counted in INVENTORY units, so compare like with like: N of this variant
    // takes N × required off the shelf.
    const needed = line.quantity * v.required

    if (available < needed) {
      problems.push({
        variant_id: line.variant_id,
        title: line.title ?? v.title,
        requested: needed,
        available: Math.max(0, available),
      })
    }
  }

  return problems
}

/**
 * Reserve every stock-managed line on an order, at the canonical warehouse.
 *
 * Idempotent: lines that already hold a reservation are skipped, so this is safe to call on an
 * order that was created before this bug was fixed — which is how those orders get repaired.
 */
export async function reserveOrderItems(
  container: MedusaContainer,
  orderId: string
): Promise<{ reserved: number; skipped: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const location = await requireSellableLocation(container)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.variant_id",
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
    ],
    filters: { id: orderId },
  })

  const items = ((data?.[0] as any)?.items ?? []) as any[]
  if (!items.length) return { reserved: 0, skipped: 0 }

  const variants = await loadVariantInventoryMap(
    container,
    items.map((i) => i.variant_id).filter(Boolean)
  )

  // What's already held, so we never reserve the same line twice.
  const existing = await inventory.listReservationItems({
    line_item_id: items.map((i) => i.id),
  })
  const reservedLines = new Set((existing ?? []).map((r: any) => r.line_item_id))

  const toCreate: any[] = []
  let skipped = 0

  for (const it of items) {
    const v = variants.get(it.variant_id)
    if (!v || !v.manage || !v.itemId) {
      skipped++
      continue
    }
    if (reservedLines.has(it.id)) {
      skipped++
      continue
    }

    // Only reserve what hasn't already shipped.
    const outstanding =
      num(it.detail?.quantity) - num(it.detail?.fulfilled_quantity)
    if (outstanding <= 0) {
      skipped++
      continue
    }

    toCreate.push({
      line_item_id: it.id,
      inventory_item_id: v.itemId,
      location_id: location.id,
      // Reservations are held in INVENTORY units, not variant units. Reserving 1 for a variant
      // that consumes 50 holds nothing like enough, and the shortfall only shows up as negative
      // stock once it ships.
      quantity: outstanding * v.required,
    })
  }

  if (toCreate.length) {
    await createReservationsWorkflow(container as any).run({
      input: { reservations: toCreate },
    })
  }

  return { reserved: toCreate.length, skipped }
}
