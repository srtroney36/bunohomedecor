import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  createLedgerEntryStep,
  deleteLedgerEntryStep,
  updateLedgerEntryStep,
  type CreateLedgerEntryInput,
  type UpdateLedgerEntryInput,
} from "./steps/ledger-entry"
import {
  bookRestockCashStep,
  createStockBatchStep,
  receiveStockStep,
} from "./steps/restock"
import {
  adjustStockLevelStep,
  createStockMovementStep,
  deleteBatchStep,
  editBatchStep,
  planHardAdjustStep,
  setStockLevelStep,
  type EditBatchInput,
} from "./steps/stock-adjust"
import {
  createPartnerStep,
  deletePartnerStep,
  updatePartnerStep,
  type CreatePartnerInput,
  type UpdatePartnerInput,
} from "./steps/partner"
import {
  createFixedAssetStep,
  createMarketingSpendStep,
  deleteFixedAssetStep,
  deleteMarketingSpendStep,
  updateFixedAssetStep,
  updateMarketingSpendStep,
  type CreateFixedAssetInput,
  type CreateMarketingSpendInput,
  type UpdateFixedAssetInput,
  type UpdateMarketingSpendInput,
} from "./steps/registers"
import {
  deleteLedgerEntryBySourceStep,
  upsertLedgerEntryForSourceStep,
} from "./steps/sync-ledger"

/* -------------------------------------- restock ------------------------------------ */

export type RestockInput = {
  variant_id: string
  quantity: number
  unit_cost: number
  freight?: number
  purchase_date?: Date
  supplier?: string | null
  note?: string | null
}

/**
 * The one-step restock: goods in, cash out, AND a FIFO cost layer, together.
 *
 * 1. Raise the ecommerce stock for the variant.
 * 2. Book the cash paid (goods + freight) as an `inventory_purchase` — an ASSET, so net
 *    worth stays flat: cash went down, but inventory value went up by the same amount.
 * 3. Record a `stock_batch` at this restock's landed unit cost, linked to the cash row, so
 *    later sales are costed FIFO against the batch they actually drew from.
 *
 * All three compensate together: you can't receive stock and forget the cash, book cash for
 * goods you never received, or end up with a cash row and no batch backing it.
 */
export const restockWorkflow = createWorkflow(
  "restock",
  function (input: RestockInput) {
    const received = receiveStockStep({
      variant_id: input.variant_id,
      quantity: input.quantity,
    })

    const ledgerInput = transform({ input, received }, ({ input, received }) => {
      const goods = Number(input.unit_cost) * Number(input.quantity)
      const cashOut = goods + Number(input.freight || 0)
      return {
        entry_date: input.purchase_date ?? new Date(),
        amount: cashOut,
        description: `Restock: ${input.quantity} × ${received.label}`,
        reference: input.supplier ?? null,
      }
    })
    const ledger = bookRestockCashStep(ledgerInput)

    const batchInput = transform(
      { input, received, ledger },
      ({ input, received, ledger }) => {
        const qty = Number(input.quantity)
        const cashOut = Number(input.unit_cost) * qty + Number(input.freight || 0)
        return {
          variant_id: input.variant_id,
          inventory_item_id: received.item_id,
          location_id: received.location_id,
          received_date: input.purchase_date ?? new Date(),
          qty_received: qty,
          unit_cost: Number(input.unit_cost),
          freight_total: Number(input.freight || 0),
          landed_unit_cost: qty > 0 ? cashOut / qty : Number(input.unit_cost),
          supplier: input.supplier ?? null,
          note: input.note ?? null,
          source: "restock" as const,
          ledger_entry_id: ledger.id,
        }
      }
    )
    createStockBatchStep(batchInput)

    return new WorkflowResponse(received)
  }
)

/* ---------------------------------- stock adjust ----------------------------------- */

export type AdjustStockInput = {
  variant_id: string
  /** `found` = positive correction (adds a cost layer, no cash). `shrinkage` = write-off. */
  direction: "found" | "shrinkage"
  quantity: number
  unit_cost?: number // found only — the cost to attach to the new layer
  date?: Date
  reason?: "shrinkage" | "damage" | "correction" // shrinkage only
  note?: string | null
}

/**
 * A non-sale stock change. Neither branch moves cash: `found` just adds a cost layer the
 * business turned out to already have, and `shrinkage` is a non-cash write-off that surfaces
 * in the P&L as a derived figure (see the dashboard route), the same way packaging does.
 */
export const adjustStockWorkflow = createWorkflow(
  "adjust-stock",
  function (input: AdjustStockInput) {
    when({ input }, ({ input }) => input.direction === "found").then(() => {
      const received = receiveStockStep({
        variant_id: input.variant_id,
        quantity: input.quantity,
      })
      const batchInput = transform({ input, received }, ({ input, received }) => ({
        variant_id: input.variant_id,
        inventory_item_id: received.item_id,
        location_id: received.location_id,
        received_date: input.date ?? new Date(),
        qty_received: Number(input.quantity),
        unit_cost: Number(input.unit_cost || 0),
        freight_total: 0,
        landed_unit_cost: Number(input.unit_cost || 0),
        source: "found" as const,
        note: input.note ?? null,
        ledger_entry_id: null,
      }))
      createStockBatchStep(batchInput)
    })

    when({ input }, ({ input }) => input.direction === "shrinkage").then(() => {
      const levelInput = transform({ input }, ({ input }) => ({
        variant_id: input.variant_id,
        delta: -Math.abs(Number(input.quantity)),
      }))
      adjustStockLevelStep(levelInput)

      const movementInput = transform({ input }, ({ input }) => ({
        variant_id: input.variant_id,
        date: input.date ?? new Date(),
        quantity: Math.abs(Number(input.quantity)),
        reason: input.reason ?? ("shrinkage" as const),
        note: input.note ?? null,
      }))
      createStockMovementStep(movementInput)
    })

    const result = transform({ input }, ({ input }) => ({
      variant_id: input.variant_id,
      direction: input.direction,
    }))
    return new WorkflowResponse(result)
  }
)

/* --------------------------------- hard adjust ------------------------------------- */

export type ReconcileStockInput = {
  variant_id: string
  /** The true count. Both physical stock AND batch-backed stock are pulled onto this. */
  target_qty: number
  /** Required when the target is ABOVE batch-backed stock — the new layer's cost per unit. */
  unit_cost?: number
  reason?: "shrinkage" | "damage" | "correction"
  date?: Date
  note?: string | null
}

/**
 * HARD ADJUST — "the real count is N".
 *
 * This is the sanctioned replacement for typing into Medusa's native stock box (which
 * inventory-stock-guard.ts now refuses). It never just moves the number: the difference is
 * booked the honest way — extra units become a costed `found` layer, missing units become a
 * write-off at FIFO cost — and THEN the physical quantity is set to the target.
 *
 * Because the delta is measured against batch-backed stock, this also heals any drift that
 * already existed: afterwards physical == batch-backed == target.
 */
export const reconcileStockWorkflow = createWorkflow(
  "reconcile-stock",
  function (input: ReconcileStockInput) {
    // Reads the position, computes the delta, and rejects an uncosted increase.
    const plan = planHardAdjustStep({
      variant_id: input.variant_id,
      target_qty: input.target_qty,
      unit_cost: input.unit_cost,
    })

    when({ plan }, ({ plan }) => plan.delta > 0).then(() => {
      const batchInput = transform({ input, plan }, ({ input, plan }) => ({
        variant_id: input.variant_id,
        inventory_item_id: plan.item_id,
        location_id: plan.location_id,
        received_date: input.date ?? new Date(),
        qty_received: plan.delta,
        unit_cost: Number(input.unit_cost),
        freight_total: 0,
        landed_unit_cost: Number(input.unit_cost),
        source: "found" as const,
        note: input.note ?? `Hard adjust: counted ${plan.target}`,
        ledger_entry_id: null,
      }))
      createStockBatchStep(batchInput)
    })

    when({ plan }, ({ plan }) => plan.delta < 0).then(() => {
      const movementInput = transform({ input, plan }, ({ input, plan }) => ({
        variant_id: input.variant_id,
        date: input.date ?? new Date(),
        quantity: Math.abs(plan.delta),
        reason: input.reason ?? ("correction" as const),
        note: input.note ?? `Hard adjust: counted ${plan.target}`,
      }))
      createStockMovementStep(movementInput)
    })

    // Land the physical number on the target last, so a failure above rolls back first.
    const setInput = transform({ input, plan }, ({ input, plan }) => ({
      variant_id: input.variant_id,
      target_qty: plan.target,
    }))
    setStockLevelStep(setInput)

    return new WorkflowResponse(plan)
  }
)

/**
 * Edit a batch — cost, freight, quantity, date, supplier or note — and let it propagate. See
 * editBatchStep for why this is safe even after the batch has partly sold.
 */
export const editBatchWorkflow = createWorkflow(
  "edit-batch",
  function (input: EditBatchInput) {
    const result = editBatchStep(input)
    return new WorkflowResponse(result)
  }
)

/** Delete an un-consumed batch, unwinding its stock and cash. */
export const deleteBatchWorkflow = createWorkflow(
  "delete-batch",
  function (input: { id: string }) {
    const result = deleteBatchStep(input)
    return new WorkflowResponse(result)
  }
)

/* -------------------------------------- ledger ------------------------------------- */

export const createLedgerEntryWorkflow = createWorkflow(
  "create-ledger-entry",
  function (input: CreateLedgerEntryInput) {
    const entry = createLedgerEntryStep(input)
    return new WorkflowResponse(entry)
  }
)

export const deleteLedgerEntryWorkflow = createWorkflow(
  "delete-ledger-entry",
  function (input: { id: string }) {
    const result = deleteLedgerEntryStep(input)
    return new WorkflowResponse(result)
  }
)

/**
 * Edit a cash movement. Nothing else needs touching: every dashboard figure is a SUM over the
 * ledger, so the correction reaches cash on hand, net worth and the P&L on its own.
 */
export const updateLedgerEntryWorkflow = createWorkflow(
  "update-ledger-entry",
  function (input: UpdateLedgerEntryInput) {
    const entry = updateLedgerEntryStep(input)
    return new WorkflowResponse(entry)
  }
)

/* ------------------------------------- partners ------------------------------------ */

export const createPartnerWorkflow = createWorkflow(
  "create-partner",
  function (input: CreatePartnerInput) {
    const partner = createPartnerStep(input)
    return new WorkflowResponse(partner)
  }
)

export const updatePartnerWorkflow = createWorkflow(
  "update-partner",
  function (input: UpdatePartnerInput) {
    const partner = updatePartnerStep(input)
    return new WorkflowResponse(partner)
  }
)

export const deletePartnerWorkflow = createWorkflow(
  "delete-partner",
  function (input: { id: string }) {
    const result = deletePartnerStep(input)
    return new WorkflowResponse(result)
  }
)

/* ----------------------------------- fixed assets ---------------------------------- */

/**
 * Two writes, one transaction: the asset register AND its mirrored row in the cash ledger.
 * The ledger is the only accumulator for cash, so an asset that never reaches it is an
 * asset the business appears to have acquired for free.
 */
export const createFixedAssetWorkflow = createWorkflow(
  "create-fixed-asset",
  function (input: CreateFixedAssetInput) {
    const asset = createFixedAssetStep(input)

    const ledgerInput = transform({ asset }, ({ asset }) => ({
      source_type: "fixed_asset" as const,
      source_id: asset.id,
      category: "fixed_asset" as const,
      entry_date: asset.purchase_date,
      amount: Number(asset.cost),
      currency_code: asset.currency_code,
      description: `Fixed asset: ${asset.name}`,
      reference: asset.supplier ?? null,
    }))

    upsertLedgerEntryForSourceStep(ledgerInput)
    return new WorkflowResponse(asset)
  }
)

/**
 * Re-syncs the SAME mirrored row (same source key) rather than appending a second one.
 * That is the entire point of the (source_type, source_id) unique index.
 *
 * Note a disposed asset keeps its ledger row: the money really was spent. Disposal only
 * removes it from what the business currently owns.
 */
export const updateFixedAssetWorkflow = createWorkflow(
  "update-fixed-asset",
  function (input: UpdateFixedAssetInput) {
    const asset = updateFixedAssetStep(input)

    const ledgerInput = transform({ asset }, ({ asset }) => ({
      source_type: "fixed_asset" as const,
      source_id: asset.id,
      category: "fixed_asset" as const,
      entry_date: asset.purchase_date,
      amount: Number(asset.cost),
      currency_code: asset.currency_code,
      description: `Fixed asset: ${asset.name}`,
      reference: asset.supplier ?? null,
    }))

    upsertLedgerEntryForSourceStep(ledgerInput)
    return new WorkflowResponse(asset)
  }
)

/** Ledger row first: if the asset delete then fails, no orphaned cash row is left behind. */
export const deleteFixedAssetWorkflow = createWorkflow(
  "delete-fixed-asset",
  function (input: { id: string }) {
    const ledgerInput = transform({ input }, ({ input }) => ({
      source_type: "fixed_asset" as const,
      source_id: input.id,
    }))

    deleteLedgerEntryBySourceStep(ledgerInput)
    const result = deleteFixedAssetStep(input)
    return new WorkflowResponse(result)
  }
)

/* --------------------------------- marketing spend --------------------------------- */

export const createMarketingSpendWorkflow = createWorkflow(
  "create-marketing-spend",
  function (input: CreateMarketingSpendInput) {
    const spend = createMarketingSpendStep(input)

    const ledgerInput = transform({ spend }, ({ spend }) => ({
      source_type: "marketing_spend" as const,
      source_id: spend.id,
      category: "marketing" as const,
      entry_date: spend.spend_date,
      amount: Number(spend.amount),
      currency_code: spend.currency_code,
      description: spend.campaign
        ? `Marketing (${spend.platform}): ${spend.campaign}`
        : `Marketing (${spend.platform})`,
      reference: null,
    }))

    upsertLedgerEntryForSourceStep(ledgerInput)
    return new WorkflowResponse(spend)
  }
)

export const updateMarketingSpendWorkflow = createWorkflow(
  "update-marketing-spend",
  function (input: UpdateMarketingSpendInput) {
    const spend = updateMarketingSpendStep(input)

    const ledgerInput = transform({ spend }, ({ spend }) => ({
      source_type: "marketing_spend" as const,
      source_id: spend.id,
      category: "marketing" as const,
      entry_date: spend.spend_date,
      amount: Number(spend.amount),
      currency_code: spend.currency_code,
      description: spend.campaign
        ? `Marketing (${spend.platform}): ${spend.campaign}`
        : `Marketing (${spend.platform})`,
      reference: null,
    }))

    upsertLedgerEntryForSourceStep(ledgerInput)
    return new WorkflowResponse(spend)
  }
)

export const deleteMarketingSpendWorkflow = createWorkflow(
  "delete-marketing-spend",
  function (input: { id: string }) {
    const ledgerInput = transform({ input }, ({ input }) => ({
      source_type: "marketing_spend" as const,
      source_id: input.id,
    }))

    deleteLedgerEntryBySourceStep(ledgerInput)
    const result = deleteMarketingSpendStep(input)
    return new WorkflowResponse(result)
  }
)
