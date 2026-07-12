import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

/**
 * Raises the stock the ecommerce holds for a variant — the "goods arrived" half of a
 * restock. The cash half is a separate ledger step in the workflow; keeping them as two
 * steps means either half can compensate the other if the transaction fails.
 *
 * Read-modify-write on the level rather than a blind set, so an existing quantity is added
 * to, never clobbered. Fine for a single-admin workflow; a high-concurrency store would
 * want an atomic adjust.
 */
export type ReceiveStockInput = { variant_id: string; quantity: number }

export const receiveStockStep = createStep(
  "receive-stock",
  async (input: ReceiveStockInput, { container }: { container: MedusaContainer }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const inventory: any = container.resolve(Modules.INVENTORY)

    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "product.title",
        "inventory_items.inventory_item_id",
      ],
      filters: { id: input.variant_id },
    })

    const v: any = data?.[0]
    if (!v) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant "${input.variant_id}" not found.`)
    }
    const itemId = v.inventory_items?.[0]?.inventory_item_id
    if (!itemId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `"${v.title ?? input.variant_id}" is not stock-managed, so there is nothing to restock. ` +
          `Turn on "Manage inventory" for this variant first.`
      )
    }

    const label = v.product?.title ? `${v.product.title} — ${v.title}` : v.title || v.sku || input.variant_id

    let levels = await inventory.listInventoryLevels({ inventory_item_id: itemId }, { take: 1 })
    let level = levels?.[0]
    let locationId = level?.location_id

    // No level yet: attach one at the first stock location and start from zero.
    if (!locationId) {
      const stockLocation: any = container.resolve(Modules.STOCK_LOCATION)
      const locs = await stockLocation.listStockLocations({}, { take: 1 })
      locationId = locs?.[0]?.id
      if (!locationId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "No stock location is configured, so stock can't be received. Create one in Settings first."
        )
      }
      await inventory.createInventoryLevels([
        { inventory_item_id: itemId, location_id: locationId, stocked_quantity: 0 },
      ])
      level = { stocked_quantity: 0 }
    }

    const before = Number(level.stocked_quantity) || 0
    const after = before + input.quantity

    await inventory.updateInventoryLevels([
      { inventory_item_id: itemId, location_id: locationId, stocked_quantity: after },
    ])

    return new StepResponse(
      { item_id: itemId, location_id: locationId, before, after, label },
      { item_id: itemId, location_id: locationId, before }
    )
  },
  async (comp, { container }) => {
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

/**
 * Books the cash a restock paid, as an `inventory_purchase` ledger row tagged
 * `source_type: "restock"`.
 *
 * This deliberately bypasses the normal create-ledger step — that step rejects
 * inventory_purchase, because a restock's cash may ONLY be created here, paired with the
 * stock increase. The "restock" source type then protects the row from being deleted in
 * the Cash Book, which would strand the stock.
 */
export type BookRestockCashInput = {
  amount: number
  entry_date: Date
  description: string
  reference?: string | null
}

export const bookRestockCashStep = createStep(
  "book-restock-cash",
  async (input: BookRestockCashInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [created] = await svc.createLedgerEntries([
      {
        entry_date: input.entry_date,
        direction: "out",
        category: "inventory_purchase",
        amount: input.amount,
        currency_code: "bdt",
        description: input.description,
        reference: input.reference ?? null,
        partner_id: null,
        source_type: "restock",
        source_id: null,
      },
    ])
    return new StepResponse({ id: created.id }, created.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.deleteLedgerEntries([id])
  }
)

/**
 * Optionally repoint a variant's cost price to what this restock actually cost per unit
 * (landed: goods + freight). Only runs when the restock asks for it.
 */
export type UpdateVariantCostInput = { variant_id: string; cost: number }

type CostCompensation = {
  deleteId?: string
  restore?: { id: string; cost: number }
}

export const updateVariantCostStep = createStep(
  "update-variant-cost",
  async (input: UpdateVariantCostInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    const [existing] = await svc.listVariantCosts({ variant_id: input.variant_id })

    if (existing) {
      const before = Number(existing.cost)
      await svc.updateVariantCosts([{ id: existing.id, cost: input.cost }])
      return new StepResponse<{ id: string }, CostCompensation>(
        { id: existing.id },
        { restore: { id: existing.id, cost: before } }
      )
    }

    const [created] = await svc.createVariantCosts([
      { variant_id: input.variant_id, cost: input.cost },
    ])
    return new StepResponse<{ id: string }, CostCompensation>(
      { id: created.id },
      { deleteId: created.id }
    )
  },
  async (comp: CostCompensation | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    if (comp.deleteId) await svc.deleteVariantCosts([comp.deleteId])
    else if (comp.restore) await svc.updateVariantCosts([comp.restore])
  }
)
