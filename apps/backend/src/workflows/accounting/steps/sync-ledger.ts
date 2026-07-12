import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"

/**
 * Mirrors a register row (a fixed asset, an ad spend) into the cash ledger.
 *
 * The ledger is the ONLY accumulator for cash. If these registers did not write into it,
 * every dashboard would have to remember to subtract each register table from cash by
 * hand — and the first spend table someone forgets is a silently wrong net worth.
 *
 * Idempotent on (source_type, source_id), which is backed by a partial unique index. So an
 * edit re-syncs the existing row rather than appending a second one, and a retried step is
 * harmless.
 */

type UpsertInput = {
  source_type: "fixed_asset" | "marketing_spend"
  source_id: string
  category: "fixed_asset" | "marketing"
  entry_date: Date
  amount: number
  currency_code: string
  description?: string | null
  reference?: string | null
}

type UpsertCompensation =
  | { mode: "delete"; id: string }
  | { mode: "restore"; before: Record<string, unknown> }

export const upsertLedgerEntryForSourceStep = createStep(
  "upsert-ledger-entry-for-source",
  async (input: UpsertInput, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [existing] = await svc.listLedgerEntries({
      source_type: input.source_type,
      source_id: input.source_id,
    })

    if (existing) {
      const before = {
        id: existing.id,
        entry_date: existing.entry_date,
        amount: Number(existing.amount),
        currency_code: existing.currency_code,
        description: existing.description,
        reference: existing.reference,
      }

      await svc.updateLedgerEntries([
        {
          id: existing.id,
          entry_date: input.entry_date,
          amount: input.amount,
          currency_code: input.currency_code,
          description: input.description ?? null,
          reference: input.reference ?? null,
        },
      ])

      return new StepResponse<{ id: string }, UpsertCompensation>(
        { id: existing.id },
        { mode: "restore", before }
      )
    }

    const [created] = await svc.createLedgerEntries([
      {
        entry_date: input.entry_date,
        // Both mirrored categories are money leaving the business.
        direction: "out",
        category: input.category,
        amount: input.amount,
        currency_code: input.currency_code,
        description: input.description ?? null,
        reference: input.reference ?? null,
        partner_id: null,
        source_type: input.source_type,
        source_id: input.source_id,
      },
    ])

    return new StepResponse<{ id: string }, UpsertCompensation>(
      { id: created.id },
      { mode: "delete", id: created.id }
    )
  },
  async (comp: UpsertCompensation | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    if (comp.mode === "delete") await svc.deleteLedgerEntries([comp.id])
    else await svc.updateLedgerEntries([comp.before])
  }
)

type DeleteBySourceInput = {
  source_type: "fixed_asset" | "marketing_spend"
  source_id: string
}

export const deleteLedgerEntryBySourceStep = createStep(
  "delete-ledger-entry-by-source",
  async (input: DeleteBySourceInput, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [existing] = await svc.listLedgerEntries({
      source_type: input.source_type,
      source_id: input.source_id,
    })
    if (!existing) return new StepResponse(null, null)

    await svc.deleteLedgerEntries([existing.id])
    return new StepResponse({ id: existing.id }, existing.id)
  },
  async (id: string | null | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.restoreLedgerEntries([id])
  }
)
