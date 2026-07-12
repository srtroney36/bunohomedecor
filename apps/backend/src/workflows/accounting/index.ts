import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  createLedgerEntryStep,
  deleteLedgerEntryStep,
  type CreateLedgerEntryInput,
} from "./steps/ledger-entry"
import {
  bookRestockCashStep,
  receiveStockStep,
  updateVariantCostStep,
} from "./steps/restock"
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
  update_cost?: boolean
  purchase_date?: Date
  supplier?: string | null
  note?: string | null
}

/**
 * The one-step restock: goods in AND cash out, together.
 *
 * 1. Raise the ecommerce stock for the variant.
 * 2. Book the cash paid (goods + freight) as an `inventory_purchase` — an ASSET, so net
 *    worth stays flat: cash went down, but inventory value went up by the same amount.
 * 3. Optionally repoint the cost price to this restock's landed unit cost.
 *
 * This is what stops the two halves from drifting: you can't receive stock and forget the
 * cash, or record cash for goods you never received.
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
    bookRestockCashStep(ledgerInput)

    when({ input }, ({ input }) => !!input.update_cost).then(() => {
      const costInput = transform({ input }, ({ input }) => {
        const cashOut = Number(input.unit_cost) * Number(input.quantity) + Number(input.freight || 0)
        return {
          variant_id: input.variant_id,
          cost: Number(input.quantity) > 0 ? cashOut / Number(input.quantity) : Number(input.unit_cost),
        }
      })
      updateVariantCostStep(costInput)
    })

    return new WorkflowResponse(received)
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
