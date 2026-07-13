import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { computeFifoCosting } from "../../../lib/insights/fifo-costing"
import { planHardAdjust } from "../../../lib/insights/hard-adjust"
import {
  ensureLevel,
  loadVariantStockAt,
  requireSellableLocation,
} from "../../../lib/inventory/stock-location"
import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

/* --------------------------------- shared helpers ---------------------------------- */

type VariantInv = {
  itemId: string
  label: string
  locationId: string
  before: number
  reserved: number
  inventory: any
}

/**
 * A variant's stock AT THE CANONICAL LOCATION.
 *
 * This used to take `listInventoryLevels(item, { take: 1 })` — an arbitrary level, which in a
 * store with more than one warehouse (including a soft-deleted one) meant writes landed
 * somewhere the reads weren't looking. Everything now pins to the one canonical location.
 */
async function loadVariantInventory(
  container: MedusaContainer,
  variantId: string
): Promise<VariantInv> {
  const inventory: any = container.resolve(Modules.INVENTORY)
  const location = await requireSellableLocation(container)
  const target = await loadVariantStockAt(container, variantId, location)
  await ensureLevel(container, target)

  return {
    itemId: target.itemId,
    label: target.label,
    locationId: target.locationId,
    before: target.onShelf,
    reserved: target.reserved,
    inventory,
  }
}

/** How much of a specific batch has already been sold (FIFO). Used to guard edits/deletes. */
async function soldForBatch(container: MedusaContainer, batchId: string): Promise<number> {
  const fifo = await computeFifoCosting(container)
  return fifo.per_batch.find((b) => b.batch_id === batchId)?.sold ?? 0
}

/** Point variant_cost.cost at the newest batch's landed cost (the "latest cost" display cache). */
async function refreshCostCache(svc: any, variantId: string): Promise<void> {
  const [newest] = await svc.listStockBatches(
    { variant_id: variantId },
    { order: { received_date: "DESC" }, take: 1 }
  )
  const cost = newest ? Number(newest.landed_unit_cost) : 0
  const [existing] = await svc.listVariantCosts({ variant_id: variantId })
  if (existing) await svc.updateVariantCosts([{ id: existing.id, cost }])
  else await svc.createVariantCosts([{ variant_id: variantId, cost }])
}

/* ------------------------------ adjust a stock level ------------------------------- */

/**
 * Raise or lower a variant's ecommerce stock by `delta` (may be negative). Floors at zero.
 * Compensation restores the exact prior quantity. Used by found/shrinkage adjustments and
 * by batch edits/deletes that change how many units a batch put on the shelf.
 */
export type AdjustStockLevelInput = { variant_id: string; delta: number }
type AdjustComp = { item_id: string; location_id: string; before: number } | null

export const adjustStockLevelStep = createStep(
  "adjust-stock-level",
  async (input: AdjustStockLevelInput, { container }: { container: MedusaContainer }) => {
    // loadVariantInventory pins us to the canonical location and guarantees the level exists.
    const inv = await loadVariantInventory(container, input.variant_id)

    const after = Math.max(0, inv.before + input.delta)
    await inv.inventory.updateInventoryLevels([
      { inventory_item_id: inv.itemId, location_id: inv.locationId, stocked_quantity: after },
    ])

    return new StepResponse<{ item_id: string; before: number; after: number; label: string }, AdjustComp>(
      { item_id: inv.itemId, before: inv.before, after, label: inv.label },
      { item_id: inv.itemId, location_id: inv.locationId, before: inv.before }
    )
  },
  async (comp: AdjustComp, { container }) => {
    if (!comp) return
    const inventory: any = container.resolve(Modules.INVENTORY)
    await inventory.updateInventoryLevels([
      { inventory_item_id: comp.item_id, location_id: comp.location_id, stocked_quantity: comp.before },
    ])
  }
)

/* --------------------------------- hard adjust ------------------------------------- */

/**
 * Work out what a "set stock to N" actually means, and refuse the one version of it that
 * would corrupt the books.
 *
 * The delta is measured against BATCH-BACKED stock (Σ remaining), not Medusa's physical
 * number — so if the two have already drifted apart, a hard adjust pulls BOTH onto the target
 * and the drift is gone. That is what makes this the reconciler as well as the editor.
 *
 * Increasing requires a cost per unit: those units become a new cost layer, and a layer
 * valued at zero would understate COGS on every future sale that draws from it — precisely
 * the failure batch costing exists to prevent.
 */
export type PlanHardAdjustInput = {
  variant_id: string
  target_qty: number
  unit_cost?: number
}

export const planHardAdjustStep = createStep(
  "plan-hard-adjust",
  async (input: PlanHardAdjustInput, { container }: { container: MedusaContainer }) => {
    const inv = await loadVariantInventory(container, input.variant_id)

    const fifo = await computeFifoCosting(container)
    const fifoRemaining = fifo.per_batch
      .filter((b) => b.variant_id === input.variant_id)
      .reduce((s, b) => s + b.remaining, 0)

    const { target, delta, error } = planHardAdjust(
      input.target_qty,
      fifoRemaining,
      input.unit_cost
    )
    if (error) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, error)
    }

    return new StepResponse({
      target,
      delta,
      fifo_remaining: fifoRemaining,
      physical_qty: inv.before,
      item_id: inv.itemId,
      location_id: inv.locationId,
      label: inv.label,
    })
  }
)

/**
 * Set a variant's stock to an ABSOLUTE quantity (adjustStockLevelStep applies a delta; this
 * lands on a number). Compensation restores the exact prior quantity.
 */
export type SetStockLevelInput = { variant_id: string; target_qty: number }
type SetComp = { item_id: string; location_id: string; before: number } | null

export const setStockLevelStep = createStep(
  "set-stock-level",
  async (input: SetStockLevelInput, { container }: { container: MedusaContainer }) => {
    const inv = await loadVariantInventory(container, input.variant_id)
    const target = Math.max(0, Number(input.target_qty))

    await inv.inventory.updateInventoryLevels([
      { inventory_item_id: inv.itemId, location_id: inv.locationId, stocked_quantity: target },
    ])

    return new StepResponse<{ before: number; after: number; item_id: string }, SetComp>(
      { before: inv.before, after: target, item_id: inv.itemId },
      { item_id: inv.itemId, location_id: inv.locationId, before: inv.before }
    )
  },
  async (comp: SetComp, { container }) => {
    if (!comp) return
    const inventory: any = container.resolve(Modules.INVENTORY)
    await inventory.updateInventoryLevels([
      {
        inventory_item_id: comp.item_id,
        location_id: comp.location_id,
        stocked_quantity: comp.before,
      },
    ])
  }
)

/* ---------------------------- record a shrinkage movement -------------------------- */

export type CreateStockMovementInput = {
  variant_id: string
  date: Date
  quantity: number
  reason: "shrinkage" | "damage" | "correction"
  note?: string | null
}

export const createStockMovementStep = createStep(
  "create-stock-movement",
  async (input: CreateStockMovementInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    const [m] = await svc.createStockMovements([
      {
        variant_id: input.variant_id,
        date: input.date,
        quantity: input.quantity,
        reason: input.reason,
        note: input.note ?? null,
      },
    ])
    return new StepResponse({ id: m.id }, m.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    await svc.deleteStockMovements([id])
  }
)

/* -------------------------------------- edit -------------------------------------- */

/**
 * Edit a batch and propagate everywhere in one step. Because COGS, inventory value and net
 * worth are all recomputed from the batches, changing a batch's cost/date re-derives them
 * automatically; here we only have to move the two things the replay does NOT own — Medusa's
 * physical stock (if the quantity changed) and the linked cash row. All prior values are
 * captured up front so a failure restores the batch, the stock and the cash together.
 */
export type EditBatchInput = {
  id: string
  unit_cost?: number
  freight_total?: number
  qty_received?: number
  received_date?: Date
  supplier?: string | null
  note?: string | null
}

type EditComp = {
  prevBatch: any
  prevCache: { variant_id: string; existed: boolean; cost: number }
  stock?: { item_id: string; location_id: string; before: number }
  prevLedger?: any
}

export const editBatchStep = createStep(
  "edit-batch",
  async (input: EditBatchInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    const batch = await svc.retrieveStockBatch(input.id)

    const oldQty = Number(batch.qty_received)
    const newQty = input.qty_received ?? oldQty
    const newUnit = input.unit_cost ?? Number(batch.unit_cost)
    const newFreight = input.freight_total ?? Number(batch.freight_total)
    const newDate = input.received_date ?? new Date(batch.received_date)

    // Can't shrink a batch below what has already sold out of it.
    const sold = await soldForBatch(container, input.id)
    if (newQty < sold) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This batch has already sold ${sold} unit(s); its quantity can't be set below that. ` +
          `Delete is blocked for the same reason — adjust the quantity to ${sold} or higher.`
      )
    }

    const landed = newQty > 0 ? (newUnit * newQty + newFreight) / newQty : newUnit

    const comp: EditComp = {
      prevBatch: {
        id: batch.id,
        qty_received: oldQty,
        unit_cost: Number(batch.unit_cost),
        freight_total: Number(batch.freight_total),
        landed_unit_cost: Number(batch.landed_unit_cost),
        received_date: batch.received_date,
        supplier: batch.supplier ?? null,
        note: batch.note ?? null,
      },
      prevCache: { variant_id: batch.variant_id, existed: false, cost: 0 },
    }

    // Capture cache before we touch it.
    const [existingCache] = await svc.listVariantCosts({ variant_id: batch.variant_id })
    if (existingCache) {
      comp.prevCache.existed = true
      comp.prevCache.cost = Number(existingCache.cost)
    }

    // 1) The batch row itself.
    await svc.updateStockBatches([
      {
        id: batch.id,
        qty_received: newQty,
        unit_cost: newUnit,
        freight_total: newFreight,
        landed_unit_cost: landed,
        received_date: newDate,
        supplier: input.supplier === undefined ? batch.supplier : input.supplier,
        note: input.note === undefined ? batch.note : input.note,
      },
    ])

    // 2) Physical stock, only if the received quantity changed.
    const delta = newQty - oldQty
    if (delta !== 0) {
      const inv = await loadVariantInventory(container, batch.variant_id)
      const after = Math.max(0, inv.before + delta)
      await inv.inventory.updateInventoryLevels([
        { inventory_item_id: inv.itemId, location_id: inv.locationId, stocked_quantity: after },
      ])
      comp.stock = { item_id: inv.itemId, location_id: inv.locationId, before: inv.before }
    }

    // 3) The linked cash row (restock batches only).
    if (batch.ledger_entry_id) {
      const acct: any = container.resolve(ACCOUNTING_MODULE)
      const led = await acct.retrieveLedgerEntry(batch.ledger_entry_id)
      comp.prevLedger = {
        id: led.id,
        amount: Number(led.amount),
        entry_date: led.entry_date,
        reference: led.reference ?? null,
        description: led.description ?? null,
      }
      await acct.updateLedgerEntries([
        {
          id: led.id,
          amount: newUnit * newQty + newFreight,
          entry_date: newDate,
          reference: input.supplier === undefined ? led.reference : input.supplier,
        },
      ])
    }

    // 4) Refresh the latest-cost display cache.
    await refreshCostCache(svc, batch.variant_id)

    return new StepResponse({ id: batch.id }, comp)
  },
  async (comp: EditComp | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(PRODUCT_COST_MODULE)

    await svc.updateStockBatches([comp.prevBatch])

    if (comp.stock) {
      const inventory: any = container.resolve(Modules.INVENTORY)
      await inventory.updateInventoryLevels([
        {
          inventory_item_id: comp.stock.item_id,
          location_id: comp.stock.location_id,
          stocked_quantity: comp.stock.before,
        },
      ])
    }

    if (comp.prevLedger) {
      const acct: any = container.resolve(ACCOUNTING_MODULE)
      await acct.updateLedgerEntries([comp.prevLedger])
    }

    if (comp.prevCache.existed) {
      const [c] = await svc.listVariantCosts({ variant_id: comp.prevCache.variant_id })
      if (c) await svc.updateVariantCosts([{ id: c.id, cost: comp.prevCache.cost }])
    }
  }
)

/* ------------------------------------- delete ------------------------------------- */

/**
 * Delete a batch and unwind it everywhere: drop its cash row, lower the stock it added, and
 * remove the layer. Only allowed while NONE of the batch has sold — a partly-sold batch is
 * blocked, because deleting it would strand already-shipped units with no cost. (Edit the
 * quantity instead.)
 */
export type DeleteBatchInput = { id: string }

type DeleteComp = {
  batch: any
  prevCache: { variant_id: string; existed: boolean; cost: number }
  stock?: { item_id: string; location_id: string; before: number }
  ledger?: any
}

export const deleteBatchStep = createStep(
  "delete-batch",
  async (input: DeleteBatchInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    const batch = await svc.retrieveStockBatch(input.id)

    const sold = await soldForBatch(container, input.id)
    if (sold > 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This batch has already sold ${sold} unit(s), so it can't be deleted. ` +
          `Edit its quantity or cost instead.`
      )
    }

    const comp: DeleteComp = {
      batch: {
        variant_id: batch.variant_id,
        inventory_item_id: batch.inventory_item_id ?? null,
        received_date: batch.received_date,
        qty_received: Number(batch.qty_received),
        unit_cost: Number(batch.unit_cost),
        freight_total: Number(batch.freight_total),
        landed_unit_cost: Number(batch.landed_unit_cost),
        currency_code: batch.currency_code,
        source: batch.source,
        supplier: batch.supplier ?? null,
        note: batch.note ?? null,
        ledger_entry_id: batch.ledger_entry_id ?? null,
      },
      prevCache: { variant_id: batch.variant_id, existed: false, cost: 0 },
    }

    const [existingCache] = await svc.listVariantCosts({ variant_id: batch.variant_id })
    if (existingCache) {
      comp.prevCache.existed = true
      comp.prevCache.cost = Number(existingCache.cost)
    }

    // Lower the stock this un-consumed batch put on the shelf.
    const qty = Number(batch.qty_received)
    const inv = await loadVariantInventory(container, batch.variant_id)
    const after = Math.max(0, inv.before - qty)
    await inv.inventory.updateInventoryLevels([
      { inventory_item_id: inv.itemId, location_id: inv.locationId, stocked_quantity: after },
    ])
    comp.stock = { item_id: inv.itemId, location_id: inv.locationId, before: inv.before }

    // Drop the linked cash row.
    if (batch.ledger_entry_id) {
      const acct: any = container.resolve(ACCOUNTING_MODULE)
      const led = await acct.retrieveLedgerEntry(batch.ledger_entry_id)
      comp.ledger = {
        entry_date: led.entry_date,
        direction: led.direction,
        category: led.category,
        amount: Number(led.amount),
        currency_code: led.currency_code,
        description: led.description ?? null,
        reference: led.reference ?? null,
        partner_id: led.partner_id ?? null,
        source_type: led.source_type,
        source_id: led.source_id ?? null,
      }
      await acct.deleteLedgerEntries([batch.ledger_entry_id])
    }

    await svc.deleteStockBatches([input.id])
    await refreshCostCache(svc, batch.variant_id)

    return new StepResponse({ id: input.id, variant_id: batch.variant_id }, comp)
  },
  async (comp: DeleteComp | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(PRODUCT_COST_MODULE)

    // Re-create the batch (a new id is fine; nothing references the old one after delete).
    await svc.createStockBatches([comp.batch])

    if (comp.stock) {
      const inventory: any = container.resolve(Modules.INVENTORY)
      await inventory.updateInventoryLevels([
        {
          inventory_item_id: comp.stock.item_id,
          location_id: comp.stock.location_id,
          stocked_quantity: comp.stock.before,
        },
      ])
    }

    if (comp.ledger) {
      const acct: any = container.resolve(ACCOUNTING_MODULE)
      await acct.createLedgerEntries([comp.ledger])
    }

    if (comp.prevCache.existed) {
      const [c] = await svc.listVariantCosts({ variant_id: comp.prevCache.variant_id })
      if (c) await svc.updateVariantCosts([{ id: c.id, cost: comp.prevCache.cost }])
    }
  }
)
