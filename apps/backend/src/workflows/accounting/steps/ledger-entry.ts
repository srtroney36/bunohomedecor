import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ledgerRowGuard } from "../../../lib/accounting/ledger-guard"
import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import {
  CATEGORY_ENTRY_POINT,
  CATEGORY_META,
  PARTNER_REQUIRED_CATEGORIES,
  REGISTER_OWNED_CATEGORIES,
  type LedgerCategory,
} from "../../../modules/accounting/categories"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

export type CreateLedgerEntryInput = {
  entry_date: Date
  category: LedgerCategory
  amount: number
  currency_code?: string
  description?: string | null
  reference?: string | null
  partner_id?: string | null
}

/**
 * Creates a hand-entered cash movement.
 *
 * `direction` is NOT taken from the caller — it is a fixed property of the category. There
 * is no such thing as a capital contribution that pays money out.
 */
export const createLedgerEntryStep = createStep(
  "create-ledger-entry",
  async (input: CreateLedgerEntryInput, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const meta = CATEGORY_META[input.category]

    if (!meta) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown category "${input.category}".`)
    }

    if (!(input.amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Amount must be greater than zero. Direction comes from the category, not from a negative amount."
      )
    }

    // Some categories are owned by a dedicated flow that writes the cash row itself.
    // Hand-entering one in the Cash Book would drift the ledger from what really happened.
    if (REGISTER_OWNED_CATEGORIES.includes(input.category)) {
      const where = CATEGORY_ENTRY_POINT[input.category] ?? "its own tab"
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `"${meta.label}" is recorded from ${where}, not the Cash Book — the cash row is ` +
          `written for you there.`
      )
    }

    if (PARTNER_REQUIRED_CATEGORIES.includes(input.category)) {
      if (!input.partner_id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `"${meta.label}" must name the partner the money came from or went to.`
        )
      }
      const [partner] = await svc.listPartners({ id: input.partner_id })
      if (!partner) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `Partner "${input.partner_id}" does not exist.`
        )
      }
    }

    const [created] = await svc.createLedgerEntries([
      {
        entry_date: input.entry_date,
        direction: meta.direction,
        category: input.category,
        amount: input.amount,
        currency_code: input.currency_code ?? "bdt",
        description: input.description ?? null,
        reference: input.reference ?? null,
        partner_id: input.partner_id ?? null,
        source_type: "manual",
        source_id: null,
      },
    ])

    return new StepResponse(created, created.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.deleteLedgerEntries([id])
  }
)

/** Shared: load a row and work out whether the Cash Book may touch it. */
async function loadGuarded(container: any, id: string) {
  const svc: any = container.resolve(ACCOUNTING_MODULE)
  const costSvc: any = container.resolve(PRODUCT_COST_MODULE)

  const [existing] = await svc.listLedgerEntries({ id })
  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Ledger entry "${id}" not found.`)
  }

  // Only a restock row can have a batch behind it; skip the lookup for everything else.
  let hasBatch = false
  if (existing.source_type === "restock") {
    const batches = await costSvc.listStockBatches({ ledger_entry_id: id })
    hasBatch = (batches?.length ?? 0) > 0
  }

  return { svc, existing, guard: ledgerRowGuard(existing.source_type, hasBatch) }
}

export const deleteLedgerEntryStep = createStep(
  "delete-ledger-entry",
  async (input: { id: string }, { container }) => {
    const { svc, guard } = await loadGuarded(container, input.id)

    if (!guard.can_delete) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, guard.reason!)
    }

    await svc.deleteLedgerEntries([input.id])
    return new StepResponse({ id: input.id }, input.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.restoreLedgerEntries([id])
  }
)

/**
 * Edit a hand-entered cash movement. Every figure on the dashboard is a SUM over this table,
 * so the correction propagates by itself — nothing else to update.
 *
 * The category may only be changed on a `manual` row, and only to another hand-enterable
 * category: re-labelling a row as `inventory_purchase` would invent an asset the business
 * never bought. `direction` always comes from the (possibly new) category, never the caller.
 */
export type UpdateLedgerEntryInput = {
  id: string
  entry_date?: Date
  category?: LedgerCategory
  amount?: number
  description?: string | null
  reference?: string | null
  partner_id?: string | null
}

type UpdateComp = {
  id: string
  entry_date: Date
  category: string
  direction: string
  amount: number
  description: string | null
  reference: string | null
  partner_id: string | null
}

export const updateLedgerEntryStep = createStep(
  "update-ledger-entry",
  async (input: UpdateLedgerEntryInput, { container }) => {
    const { svc, existing, guard } = await loadGuarded(container, input.id)

    if (!guard.can_edit) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, guard.reason!)
    }

    const category = (input.category ?? existing.category) as LedgerCategory
    const meta = CATEGORY_META[category]
    if (!meta) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown category "${category}".`)
    }

    if (input.category && input.category !== existing.category) {
      if (existing.source_type !== "manual") {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "This row's category can't be changed — only the amount, date and details."
        )
      }
      if (REGISTER_OWNED_CATEGORIES.includes(input.category)) {
        const where = CATEGORY_ENTRY_POINT[input.category] ?? "its own tab"
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `"${meta.label}" is recorded from ${where}, not the Cash Book — a row can't be ` +
            `re-labelled into it.`
        )
      }
    }

    const amount = input.amount ?? Number(existing.amount)
    if (!(amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Amount must be greater than zero. Direction comes from the category, not from a negative amount."
      )
    }

    const partnerId =
      input.partner_id !== undefined ? input.partner_id : (existing.partner_id ?? null)

    if (PARTNER_REQUIRED_CATEGORIES.includes(category)) {
      if (!partnerId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `"${meta.label}" must name the partner the money came from or went to.`
        )
      }
      const [partner] = await svc.listPartners({ id: partnerId })
      if (!partner) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, `Partner "${partnerId}" does not exist.`)
      }
    }

    const before: UpdateComp = {
      id: existing.id,
      entry_date: existing.entry_date,
      category: existing.category,
      direction: existing.direction,
      amount: Number(existing.amount),
      description: existing.description ?? null,
      reference: existing.reference ?? null,
      partner_id: existing.partner_id ?? null,
    }

    const [updated] = await svc.updateLedgerEntries([
      {
        id: input.id,
        entry_date: input.entry_date ?? existing.entry_date,
        category,
        direction: meta.direction, // always derived
        amount,
        description:
          input.description !== undefined ? input.description : (existing.description ?? null),
        reference: input.reference !== undefined ? input.reference : (existing.reference ?? null),
        // A category that doesn't name a partner must not keep a stale one.
        partner_id: PARTNER_REQUIRED_CATEGORIES.includes(category) ? partnerId : null,
      },
    ])

    return new StepResponse(updated, before)
  },
  async (before: UpdateComp | undefined, { container }) => {
    if (!before) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.updateLedgerEntries([before])
  }
)
