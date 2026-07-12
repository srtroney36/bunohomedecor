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
 * Records the restock as a FIFO cost LAYER (stock_batch) instead of overwriting one flat
 * cost. Each batch keeps its own landed unit cost, so a later sale can be costed against the
 * batch it actually drew from.
 *
 * It also refreshes the `variant_cost.cost` display cache to this batch's landed cost — that
 * column is no longer the COGS basis, just the "latest cost" shown on the product page and
 * prefilled into the restock form.
 */
export type CreateStockBatchInput = {
  variant_id: string
  inventory_item_id?: string | null
  received_date: Date
  qty_received: number
  unit_cost: number
  freight_total: number
  landed_unit_cost: number
  currency_code?: string
  source?: "restock" | "found" | "opening"
  supplier?: string | null
  note?: string | null
  ledger_entry_id?: string | null
}

type BatchCompensation = {
  batch_id: string
  prevCost?: { id: string; cost: number }
  createdCostId?: string
}

export const createStockBatchStep = createStep(
  "create-stock-batch",
  async (input: CreateStockBatchInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(PRODUCT_COST_MODULE)

    const [batch] = await svc.createStockBatches([
      {
        variant_id: input.variant_id,
        inventory_item_id: input.inventory_item_id ?? null,
        received_date: input.received_date,
        qty_received: input.qty_received,
        unit_cost: input.unit_cost,
        freight_total: input.freight_total,
        landed_unit_cost: input.landed_unit_cost,
        currency_code: input.currency_code ?? "bdt",
        source: input.source ?? "restock",
        supplier: input.supplier ?? null,
        note: input.note ?? null,
        ledger_entry_id: input.ledger_entry_id ?? null,
      },
    ])

    // Refresh the latest-cost display cache without touching packaging_cost.
    const comp: BatchCompensation = { batch_id: batch.id }
    const [existing] = await svc.listVariantCosts({ variant_id: input.variant_id })
    if (existing) {
      comp.prevCost = { id: existing.id, cost: Number(existing.cost) }
      await svc.updateVariantCosts([{ id: existing.id, cost: input.landed_unit_cost }])
    } else {
      const [created] = await svc.createVariantCosts([
        { variant_id: input.variant_id, cost: input.landed_unit_cost },
      ])
      comp.createdCostId = created.id
    }

    return new StepResponse<{ id: string }, BatchCompensation>({ id: batch.id }, comp)
  },
  async (comp: BatchCompensation | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(PRODUCT_COST_MODULE)
    await svc.deleteStockBatches([comp.batch_id])
    if (comp.prevCost) await svc.updateVariantCosts([comp.prevCost])
    else if (comp.createdCostId) await svc.deleteVariantCosts([comp.createdCostId])
  }
)
