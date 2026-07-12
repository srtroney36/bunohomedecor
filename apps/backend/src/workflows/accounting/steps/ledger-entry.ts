import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import {
  CATEGORY_META,
  PARTNER_REQUIRED_CATEGORIES,
  REGISTER_OWNED_CATEGORIES,
  type LedgerCategory,
} from "../../../modules/accounting/categories"

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

    // Fixed assets and marketing own their own mirrored ledger rows. Letting someone also
    // type one straight into the Cash Book would drift the ledger away from the register
    // that is supposed to explain it.
    if (REGISTER_OWNED_CATEGORIES.includes(input.category)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `"${meta.label}" entries are created from their own tab, not the Cash Book — ` +
          `use /admin/accounting/${input.category === "fixed_asset" ? "fixed-assets" : "marketing"}. ` +
          `The cash row is written for you.`
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

export const deleteLedgerEntryStep = createStep(
  "delete-ledger-entry",
  async (input: { id: string }, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [existing] = await svc.listLedgerEntries({ id: input.id })
    if (!existing) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Ledger entry "${input.id}" not found.`)
    }

    // A mirrored row is owned by its register. Deleting it here would leave the fixed asset
    // or ad spend on the books with no cash ever having left the account.
    if (existing.source_type !== "manual") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This row mirrors a ${existing.source_type.replace("_", " ")} and cannot be deleted from the ` +
          `Cash Book. Delete the underlying record instead and this row goes with it.`
      )
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
