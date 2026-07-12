import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import type {
  FixedAssetCategory,
  MarketingPlatform,
} from "../../../modules/accounting/categories"

/* ----------------------------------- fixed assets ---------------------------------- */

export type CreateFixedAssetInput = {
  name: string
  category?: FixedAssetCategory
  purchase_date: Date
  cost: number
  currency_code?: string
  quantity?: number
  supplier?: string | null
  notes?: string | null
}

export type UpdateFixedAssetInput = Partial<CreateFixedAssetInput> & {
  id: string
  is_disposed?: boolean
  disposed_at?: Date | null
}

const assertPositive = (amount: number | undefined, what: string) => {
  if (amount !== undefined && !(amount > 0)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${what} must be greater than zero.`)
  }
}

export const createFixedAssetStep = createStep(
  "create-fixed-asset",
  async (input: CreateFixedAssetInput, { container }) => {
    assertPositive(input.cost, "Cost")
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [created] = await svc.createFixedAssets([
      { ...input, currency_code: input.currency_code ?? "bdt" },
    ])
    return new StepResponse(created, created.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.deleteFixedAssets([id])
  }
)

export const updateFixedAssetStep = createStep(
  "update-fixed-asset",
  async (input: UpdateFixedAssetInput, { container }) => {
    assertPositive(input.cost, "Cost")
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [before] = await svc.listFixedAssets({ id: input.id })
    if (!before) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Fixed asset "${input.id}" not found.`)
    }

    const [updated] = await svc.updateFixedAssets([input])
    return new StepResponse(updated, {
      id: before.id,
      name: before.name,
      category: before.category,
      purchase_date: before.purchase_date,
      cost: Number(before.cost),
      currency_code: before.currency_code,
      quantity: before.quantity,
      supplier: before.supplier,
      notes: before.notes,
      is_disposed: before.is_disposed,
      disposed_at: before.disposed_at,
    })
  },
  async (before: Record<string, unknown> | undefined, { container }) => {
    if (!before) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.updateFixedAssets([before])
  }
)

export const deleteFixedAssetStep = createStep(
  "delete-fixed-asset",
  async (input: { id: string }, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [existing] = await svc.listFixedAssets({ id: input.id })
    if (!existing) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Fixed asset "${input.id}" not found.`)
    }
    await svc.deleteFixedAssets([input.id])
    return new StepResponse({ id: input.id }, input.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.restoreFixedAssets([id])
  }
)

/* --------------------------------- marketing spend --------------------------------- */

export type CreateMarketingSpendInput = {
  spend_date: Date
  platform: MarketingPlatform
  campaign?: string | null
  amount: number
  currency_code?: string
  notes?: string | null
}

export type UpdateMarketingSpendInput = Partial<CreateMarketingSpendInput> & { id: string }

export const createMarketingSpendStep = createStep(
  "create-marketing-spend",
  async (input: CreateMarketingSpendInput, { container }) => {
    assertPositive(input.amount, "Amount")
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [created] = await svc.createMarketingSpends([
      { ...input, currency_code: input.currency_code ?? "bdt" },
    ])
    return new StepResponse(created, created.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.deleteMarketingSpends([id])
  }
)

export const updateMarketingSpendStep = createStep(
  "update-marketing-spend",
  async (input: UpdateMarketingSpendInput, { container }) => {
    assertPositive(input.amount, "Amount")
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [before] = await svc.listMarketingSpends({ id: input.id })
    if (!before) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Marketing spend "${input.id}" not found.`)
    }

    const [updated] = await svc.updateMarketingSpends([input])
    return new StepResponse(updated, {
      id: before.id,
      spend_date: before.spend_date,
      platform: before.platform,
      campaign: before.campaign,
      amount: Number(before.amount),
      currency_code: before.currency_code,
      notes: before.notes,
    })
  },
  async (before: Record<string, unknown> | undefined, { container }) => {
    if (!before) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.updateMarketingSpends([before])
  }
)

export const deleteMarketingSpendStep = createStep(
  "delete-marketing-spend",
  async (input: { id: string }, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [existing] = await svc.listMarketingSpends({ id: input.id })
    if (!existing) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Marketing spend "${input.id}" not found.`)
    }
    await svc.deleteMarketingSpends([input.id])
    return new StepResponse({ id: input.id }, input.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.restoreMarketingSpends([id])
  }
)
